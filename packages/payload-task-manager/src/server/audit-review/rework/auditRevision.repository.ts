/**
 * @file packages/payload-task-manager/src/server/audit-review/rework/auditRevision.repository.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Публикует исправленный отчёт новой попытки по поручению аудитору и сохраняет ответы на замечания.
 * @see documentation/specifications/task-management/execution/article-audit-rework.md
 */
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual as equal } from "node:util";
import type { Pool, PoolClient } from "pg";
import { loadAuditResult, readAuditArtifact } from "../AuditDossier.repository";
import type {
  AuditFileCoverage,
  AuditPublication,
  PublishedAudit,
} from "../AuditPublication.types";
import { assertReviewRead } from "../auditReviewPlan.repository";
import { prepareAuditMaterials } from "../prepareAuditMaterials.mapper";
import { persistAuditResult } from "../persistAuditResult.repository";
import { assertAcceptanceBasis } from "../conclusions/reviewAcceptanceBasis.repository";
import { withAuditTransaction } from "../withAuditTransaction.repository";
import {
  requireReworkClaim,
  completeReworkClaim,
} from "./reworkClaim.repository";
import {
  readAuditRevisionForWork,
  readAuditRevisionLink,
} from "./auditRevisionLinks.repository";
import { validateAuditRevisionResponses } from "./auditRevisionResponses.validator";
import type { AuditRevisionResponse } from "./AuditRevision.types";

export {
  readAuditRevisionForWork,
  readAuditRevisionLink,
} from "./auditRevisionLinks.repository";

/** Каждая ревизия наследует проверенные pins родителя, в том числе при повторной доработке. */
async function assertFreshAudit(
  client: PoolClient,
  actorId: string,
  parent: PublishedAudit,
  prepared: ReturnType<typeof prepareAuditMaterials>,
) {
  const files = await client.query<{ path: string; sha: string }>(
    "SELECT path,sha FROM audit_dossier.sources WHERE result_id=$1",
    [parent.resultId],
  );
  const coverageBytes = await readAuditArtifact(
    client,
    parent.resultId,
    "coverage",
    actorId,
  );
  const coverage: AuditFileCoverage[] = JSON.parse(
    coverageBytes.toString("utf8"),
  );
  if (
    !equal(
      prepared.sourcePins,
      Object.fromEntries(files.rows.map((f) => [f.path, f.sha])),
    ) ||
    !equal(
      prepared.scopePins,
      Object.fromEntries(coverage.map((f) => [f.path, f.sha256])),
    )
  )
    throw new Error("audit_revision_pins_mismatch");
  const before = await readAuditArtifact(
    client,
    parent.resultId,
    "report",
    actorId,
  );
  const normalize = (s: string) => s.trim().replace(/\s+/gu, " ");
  if (
    normalize(before.toString("utf8")) === normalize(prepared.manifest.report)
  )
    throw new Error("audit_revision_unchanged");
  const previousRequests = new Set(
    coverage.flatMap((f) =>
      f.receipts.flatMap((r) => [r.sourceRequestId, r.requestId]),
    ),
  );
  const reads = prepared.manifest.coverage.flatMap((f) => f.receipts);
  if (
    !reads.length ||
    reads.some(
      (r) =>
        previousRequests.has(r.requestId) ||
        previousRequests.has(r.sourceRequestId),
    )
  )
    throw new Error("audit_revision_reads_invalid");
}

export class AuditReworkRepository {
  constructor(private readonly pool: Pool) {}

  async initialize() {
    const schema = await readFile(
      new URL("./auditRevisionSchema.sql", import.meta.url),
      "utf8",
    );
    await withAuditTransaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('realize.audit_dossier.revision_links'))",
      );
      await client.query(schema);
    });
  }

  /** После смены основания разрешён точный повтор уже записанного результата под действующими правами. */
  async publish(
    actorId: string,
    workId: string,
    input: AuditPublication,
    responses: AuditRevisionResponse[],
  ): Promise<PublishedAudit> {
    const prepared = prepareAuditMaterials(input);
    const submitted = structuredClone(responses);
    return withAuditTransaction(this.pool, async (client) => {
      const { work, parent, attemptId } = await requireReworkClaim(
        client,
        actorId,
        workId,
      );
      if (work.action !== "return_audit")
        throw new Error("audit_revision_work_invalid");
      const previous = await loadAuditResult(client, parent.delivery.resultId);
      if (
        work.resultId !== previous.resultId ||
        work.conclusionId !== parent.conclusionId ||
        work.expectedRevision !== previous.resultRevision + 1 ||
        work.taskId !== previous.task.taskId ||
        work.assignmentId !== previous.task.taskAssignmentId ||
        work.assignmentRevision !== previous.task.assignmentRevision ||
        work.nextIteration !== parent.delivery.target.iteration + 1 ||
        !equal(prepared.manifest.task, previous.task) ||
        prepared.manifest.attemptId !== attemptId ||
        attemptId === previous.attemptId
      )
        throw new Error("audit_revision_origin_mismatch");
      const points = validateAuditRevisionResponses(
        work,
        prepared.manifest.report,
        submitted,
      );
      // Саму запись claim не меняем. Блокировка сериализует проверку повтора, публикацию и завершение поручения.
      await client.query(
        "SELECT work_id FROM audit_rework.claims WHERE work_id=$1 FOR UPDATE",
        [workId],
      );
      const existing = await readAuditRevisionForWork(client, workId);
      if (existing) {
        const link = await readAuditRevisionLink(client, existing.resultId);
        if (
          existing.handoffSha256 !== prepared.handoffSha256 ||
          !equal(link?.responses, points)
        )
          throw new Error("audit_revision_conflict");
        await assertFreshAudit(client, actorId, previous, prepared);
        return existing;
      }
      await assertAcceptanceBasis(client, parent.delivery, parent.basis);
      const finished = await client.query(
        "SELECT 1 FROM audit_rework.completed WHERE work_id=$1",
        [workId],
      );
      if (finished.rowCount) throw new Error("rework_already_completed");
      await assertFreshAudit(client, actorId, previous, prepared);
      const saved = await persistAuditResult(client, prepared, previous);
      await client.query(
        `INSERT INTO audit_dossier.revision_links(work_id,result_id,parent_result_id,parent_revision,decision_id,
         parent_conclusion_id,parent_conclusion_revision,parent_conclusion_sha,iteration,responses)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
        [
          workId,
          saved.resultId,
          previous.resultId,
          previous.resultRevision,
          work.decisionId,
          parent.conclusionId,
          parent.revision,
          parent.sha256,
          work.nextIteration,
          JSON.stringify(points),
        ],
      );
      await completeReworkClaim(client, workId);
      return saved;
    });
  }

  /** Досье открывает замечания и ответы только при действующем доступе к материалам конкретной задачи. */
  readLink(resultId: string, actorId: string) {
    return withAuditTransaction(this.pool, async (client) => {
      const result = await loadAuditResult(client, resultId);
      await assertReviewRead(client, result.task, actorId);
      return readAuditRevisionLink(client, resultId);
    });
  }
}
