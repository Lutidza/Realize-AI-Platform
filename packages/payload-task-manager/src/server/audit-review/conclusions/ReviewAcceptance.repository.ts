/**
 * @file packages/payload-task-manager/src/server/audit-review/conclusions/ReviewAcceptance.repository.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Доставляет заключение полномочному участнику и атомарно фиксирует решение и адресованную доработку.
 * @see documentation/specifications/task-management/execution/article-audit-conclusion.md
 */
import { prepareDecisionRecords } from "./prepareDecisionRecords.mapper";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual as equal } from "node:util";
import type { Pool, PoolClient } from "pg";
import type { ReviewDelivery } from "../AuditPublication.types";
import { assertReviewRead } from "../auditReviewPlan.repository";
import { withAuditTransaction } from "../withAuditTransaction.repository";
import { loadConclusion } from "./ReviewConclusion.repository";
import type { PublishedConclusion } from "./ReviewConclusion.types";
import type {
  AcceptanceSettings,
  AuditDecision,
  AuditRework,
  ReviewDecisionCommand,
} from "./ReviewAcceptance.types";
import {
  acceptanceActors,
  assertAcceptanceBasis,
  assertDecisionHistoryAccess,
  assertOrchestratorRead,
  configureAcceptance,
} from "./reviewAcceptanceBasis.repository";
import { validateReviewDecision } from "./validateReviewDecision.validator";

async function addressedConclusion(
  client: PoolClient,
  actorId: string,
  conclusionId: string,
  mode: "pending" | "decision" | "history",
) {
  const conclusion = await loadConclusion(client, conclusionId);
  if (mode === "history") {
    await assertDecisionHistoryAccess(client, conclusion.delivery, actorId);
  } else {
    const basis = await assertOrchestratorRead(
      client,
      conclusion.delivery,
      actorId,
    );
    if (!equal(basis, conclusion.basis)) throw new Error("review_basis_stale");
  }
  const inbox = await client.query(
    "SELECT actor_id FROM audit_acceptance.inbox WHERE conclusion_id=$1 AND actor_id=$2" +
      (mode === "decision" ? " FOR UPDATE" : ""),
    [conclusionId, actorId],
  );
  if (!inbox.rowCount) throw new Error("conclusion_not_delivered");
  return conclusion;
}

async function deliverConclusion(client: PoolClient, conclusionId: string) {
  const conclusion = await loadConclusion(client, conclusionId);
  const basis = await assertAcceptanceBasis(
    client,
    conclusion.delivery,
    conclusion.basis,
  );
  await client.query(
    "INSERT INTO audit_acceptance.inbox(conclusion_id,actor_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [conclusionId, basis.orchestratorId],
  );
  const row = await client.query<{ actor_id: string }>(
    "SELECT actor_id FROM audit_acceptance.inbox WHERE conclusion_id=$1",
    [conclusionId],
  );
  if (row.rows[0]?.actor_id !== basis.orchestratorId)
    throw new Error("orchestrator_access_denied");
}

async function decisionFor(client: PoolClient, conclusionId: string) {
  const row = await client.query<{ manifest: AuditDecision }>(
    "SELECT manifest FROM audit_acceptance.decisions WHERE conclusion_id=$1",
    [conclusionId],
  );
  return row.rows[0]?.manifest;
}

const BLOCKED = new Set([
  "review_basis_stale",
  "review_basis_unavailable",
  "orchestrator_access_denied",
  "orchestrator_independence_required",
  "review_assignment_unavailable",
  "review_access_denied",
  "review_independence_required",
  "audit_delivery_conflict",
]);

/** Операции закрытого серверного адаптера. Actor поступает из аутентифицированного контекста вызывающей стороны. */
export class ReviewAcceptanceRepository {
  constructor(private readonly pool: Pool) {}

  async initialize() {
    const schema = await readFile(
      new URL("./reviewAcceptanceSchema.sql", import.meta.url),
      "utf8",
    );
    await withAuditTransaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('realize.audit_acceptance.schema'))",
      );
      await client.query(schema);
    });
  }

  configure(
    ownerActorId: string,
    delivery: ReviewDelivery,
    settings: AcceptanceSettings,
    expectedRevision = 0,
  ) {
    const envelope = structuredClone(delivery),
      policy = structuredClone(settings);
    return withAuditTransaction(this.pool, (client) =>
      configureAcceptance(
        client,
        ownerActorId,
        envelope,
        policy,
        expectedRevision,
      ),
    );
  }

  basis(actorId: string, delivery: ReviewDelivery) {
    const envelope = structuredClone(delivery);
    return withAuditTransaction(this.pool, (client) =>
      assertOrchestratorRead(client, envelope, actorId),
    );
  }

  /** Восстанавливает только незафиксированные доставки, с независимой транзакцией на каждое событие. */
  async dispatchPending() {
    const ids = await withAuditTransaction(
      this.pool,
      async (client) =>
        (
          await client.query<{ result_id: string }>(`
      SELECT e.result_id FROM audit_conclusions.published_events e
      LEFT JOIN audit_acceptance.inbox i ON i.conclusion_id=e.result_id WHERE i.conclusion_id IS NULL
      ORDER BY e.created_at, e.result_id`)
        ).rows,
    );
    const outcomes = [];
    for (const { result_id: conclusionId } of ids) {
      try {
        await withAuditTransaction(this.pool, (client) =>
          deliverConclusion(client, conclusionId),
        );
        outcomes.push({ conclusionId, status: "delivered" as const });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "";
        if (BLOCKED.has(reason))
          outcomes.push({ conclusionId, status: "blocked" as const, reason });
        else
          outcomes.push({
            conclusionId,
            status: "retry_pending" as const,
            reason: "delivery_unconfirmed",
          });
      }
    }
    return outcomes;
  }

  /** Показывает доставленные заключения с действующими правами адресата, ожидающие его решения. */
  inbox(actorId: string): Promise<PublishedConclusion[]> {
    return withAuditTransaction(this.pool, async (client) => {
      const rows = await client.query<{ conclusion_id: string }>(
        `SELECT i.conclusion_id FROM audit_acceptance.inbox i
        LEFT JOIN audit_acceptance.decisions d USING(conclusion_id) WHERE i.actor_id=$1 AND d.decision_id IS NULL
        ORDER BY i.created_at,i.conclusion_id`,
        [actorId],
      );
      const inbox = [];
      for (const { conclusion_id: id } of rows.rows) {
        try {
          inbox.push(await addressedConclusion(client, actorId, id, "pending"));
        } catch (error) {
          if (!(
            error instanceof Error &&
            ["orchestrator_access_denied", "review_basis_stale"].includes(
              error.message,
            )
          ))
            throw error;
        }
      }
      return inbox;
    });
  }

  /** Одна блокировка доставленного заключения сериализует конкурирующие решения и создание поручения. */
  decide(
    actorId: string,
    conclusionId: string,
    input: ReviewDecisionCommand,
  ): Promise<AuditDecision> {
    const request = structuredClone(input);
    return withAuditTransaction(this.pool, async (client) => {
      const conclusion = await addressedConclusion(
        client,
        actorId,
        conclusionId,
        "decision",
      );
      const existing = await decisionFor(client, conclusionId);
      const command = validateReviewDecision(request, conclusion, existing);
      if (existing) return existing;
      const actors = await acceptanceActors(
        client,
        conclusion.delivery,
        actorId,
      );
      const { decision, work } = prepareDecisionRecords(
        conclusion,
        command,
        actorId,
        actors,
      );
      await client.query(
        "INSERT INTO audit_acceptance.decisions(conclusion_id,decision_id,manifest) VALUES($1,$2,$3)",
        [conclusionId, decision.decisionId, decision],
      );
      if (work) {
        await client.query(
          "INSERT INTO audit_acceptance.work(work_id,decision_id,record) VALUES($1,$2,$3)",
          [work.workId, decision.decisionId, work],
        );
      }
      return decision;
    });
  }

  readDecision(actorId: string, conclusionId: string): Promise<AuditDecision> {
    return withAuditTransaction(this.pool, async (client) => {
      await addressedConclusion(client, actorId, conclusionId, "history");
      const decision = await decisionFor(client, conclusionId);
      if (!decision) throw new Error("review_decision_unavailable");
      return decision;
    });
  }

  readWork(actorId: string, workId: string): Promise<AuditRework> {
    return withAuditTransaction(this.pool, async (client) => {
      const row = await client.query<{ record: AuditRework }>(
        "SELECT record FROM audit_acceptance.work WHERE work_id=$1",
        [workId],
      );
      const work = row.rows[0]?.record;
      if (!work) throw new Error("review_work_unavailable");
      const conclusion = await loadConclusion(client, work.conclusionId);
      if (actorId === work.assigneeId)
        await assertReviewRead(client, conclusion.delivery.task, actorId);
      else
        await addressedConclusion(
          client,
          actorId,
          work.conclusionId,
          "history",
        );
      return work;
    });
  }
}
