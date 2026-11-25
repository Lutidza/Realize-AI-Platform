/**
 * @file packages/payload-task-manager/src/server/audit-review/rework/reworkClaim.repository.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Выдаёт поручение адресату действующего назначения и связывает повторные обращения с одной попыткой.
 * @see documentation/specifications/task-management/execution/article-audit-rework.md
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import {
  assertReviewRead,
  resolveReviewTarget,
} from "../auditReviewPlan.repository";
import { withAuditTransaction } from "../withAuditTransaction.repository";
import { readAuditArtifact } from "../AuditDossier.repository";
import { loadConclusion } from "../conclusions/ReviewConclusion.repository";
import type { AuditRework } from "../conclusions/ReviewAcceptance.types";
import { assertAcceptanceBasis } from "../conclusions/reviewAcceptanceBasis.repository";

/** Прикладной вход получает actorId от авторизованного адаптера. Данные поручения выдаёт сервер решения. */
async function addressedWork(
  client: PoolClient,
  actorId: string,
  workId: string,
) {
  const rows = await client.query<{ record: AuditRework }>(
    `SELECT record FROM audit_acceptance.work
    WHERE work_id=$1 AND record->>'assigneeId'=$2 FOR SHARE`,
    [workId, actorId],
  );
  const work = rows.rows[0]?.record;
  if (!work) throw new Error("rework_access_denied");
  const parent = await loadConclusion(client, work.conclusionId);
  await assertReviewRead(client, parent.delivery.task, actorId);
  await resolveReviewTarget(client, parent.delivery.task);
  return { work, parent };
}

async function storedAttempt(
  client: PoolClient,
  actorId: string,
  workId: string,
) {
  const row = await client.query<{ attemptId: string }>(
    `SELECT attempt_id AS "attemptId" FROM audit_rework.claims
    WHERE work_id=$1 AND actor_id=$2`,
    [workId, actorId],
  );
  if (!row.rows[0]) throw new Error("rework_attempt_unbound");
  return row.rows[0].attemptId;
}

/** Для текущей операции вызывающий дополнительно сверяет основание первой публикации либо точный повтор. */
export async function requireReworkClaim(
  client: PoolClient,
  actorId: string,
  workId: string,
) {
  const source = await addressedWork(client, actorId, workId);
  return { ...source, attemptId: await storedAttempt(client, actorId, workId) };
}

export async function completeReworkClaim(client: PoolClient, workId: string) {
  await client.query(
    "INSERT INTO audit_rework.completed(work_id) VALUES($1) ON CONFLICT DO NOTHING",
    [workId],
  );
}

export class ReworkInboxRepository {
  constructor(private readonly pool: Pool) {}

  async initialize() {
    const schema = await readFile(
      new URL("./reworkClaimSchema.sql", import.meta.url),
      "utf8",
    );
    await withAuditTransaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('realize.rework.claims'))",
      );
      await client.query(schema);
    });
  }

  /** Открытые поручения можно обнаружить после перезапуска по идентичности участника. */
  inbox(actorId: string): Promise<AuditRework[]> {
    return withAuditTransaction(this.pool, async (client) => {
      const result = await client.query<{ work_id: string }>(
        `SELECT w.work_id FROM audit_acceptance.work w
        LEFT JOIN audit_rework.completed c USING(work_id)
        WHERE w.record->>'assigneeId'=$1 AND c.work_id IS NULL ORDER BY w.work_id`,
        [actorId],
      );
      const visible: AuditRework[] = [];
      for (const row of result.rows) {
        try {
          const { work, parent } = await addressedWork(
            client,
            actorId,
            row.work_id,
          );
          await assertAcceptanceBasis(client, parent.delivery, parent.basis);
          visible.push(work);
        } catch (error) {
          if (!(
            error instanceof Error &&
            [
              "review_access_denied",
              "review_assignment_unavailable",
              "review_basis_stale",
              "orchestrator_access_denied",
              "review_independence_required",
              "orchestrator_independence_required",
            ].includes(error.message)
          ))
            throw error;
        }
      }
      return visible;
    });
  }

  /** Формирует закреплённые предметные данные попытки после повторной проверки актуального доступа. */
  readAuditInput(actorId: string, workId: string, attemptId: string) {
    return withAuditTransaction(this.pool, async (client) => {
      const claim = await requireReworkClaim(client, actorId, workId);
      if (claim.attemptId !== attemptId || claim.work.action !== "return_audit")
        throw new Error("rework_attempt_mismatch");
      const { parent, work } = claim;
      await assertAcceptanceBasis(client, parent.delivery, parent.basis);
      const completed = await client.query(
        "SELECT 1 FROM audit_rework.completed WHERE work_id=$1",
        [workId],
      );
      if (completed.rowCount) throw new Error("rework_already_submitted");
      const report = await readAuditArtifact(
        client,
        work.resultId,
        "report",
        actorId,
      );
      const sources = await client.query<{ path: string; sha: string }>(
        "SELECT path,sha FROM audit_dossier.sources WHERE result_id=$1 ORDER BY path",
        [work.resultId],
      );
      return {
        work,
        sourcePins: Object.fromEntries(
          sources.rows.map((row) => [row.path, row.sha]),
        ),
        previousReport: report.toString("utf8"),
        previousConclusion: parent.body,
        previousConclusionSha256: parent.sha256,
        reportRef: parent.delivery.report,
        coverageRef: parent.delivery.coverage,
      };
    });
  }

  claim(actorId: string, workId: string) {
    return withAuditTransaction(this.pool, async (client) => {
      const source = await addressedWork(client, actorId, workId);
      await assertAcceptanceBasis(
        client,
        source.parent.delivery,
        source.parent.basis,
      );
      await client.query(
        "INSERT INTO audit_rework.claims(work_id,actor_id,attempt_id) VALUES($1,$2,$3) ON CONFLICT(work_id) DO NOTHING",
        [workId, actorId, randomUUID()],
      );
      return {
        ...source,
        attemptId: await storedAttempt(client, actorId, workId),
      };
    });
  }
}
