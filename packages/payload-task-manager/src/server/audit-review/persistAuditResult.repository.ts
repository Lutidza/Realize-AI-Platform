/**
 * @file packages/payload-task-manager/src/server/audit-review/persistAuditResult.repository.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Фиксирует версию результата, артефакты и событие внутри авторизованной транзакции досье.
 * @see documentation/specifications/task-management/execution/article-audit-rework.md
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { PublishedAudit } from "./AuditPublication.types";
import type { prepareAuditMaterials } from "./prepareAuditMaterials.mapper";

/** Владелец операции проверяет источник и назначение в той же транзакции перед записью. */
export async function persistAuditResult(
  client: PoolClient,
  prepared: ReturnType<typeof prepareAuditMaterials>,
  previous?: PublishedAudit,
): Promise<PublishedAudit> {
  const { manifest, handoffSha256, sources } = prepared;
  const revision = previous ? previous.resultRevision + 1 : 1;
  const audit: PublishedAudit = {
    resultId: randomUUID(),
    resultRevision: revision,
    task: manifest.task,
    attemptId: manifest.attemptId,
    checkpointRevision: manifest.checkpointRevision,
    handoffSha256,
    report: {
      artifactId: previous?.report.artifactId ?? randomUUID(),
      revision,
      sha256: manifest.reportSha256,
    },
    coverage: {
      artifactId: previous?.coverage.artifactId ?? randomUUID(),
      revision,
      sha256: prepared.coverageSha256,
    },
  };
  const inserted = await client.query(
    `INSERT INTO audit_dossier.results(result_id,task_id,origin,attempt_id,slot,manifest)
    VALUES ($1,$2,'worker-assignment',$3,'article-audit',$4)
    ON CONFLICT (origin,attempt_id,slot) DO NOTHING`,
    [audit.resultId, audit.task.taskId, audit.attemptId, JSON.stringify(audit)],
  );
  if (!inserted.rowCount) {
    const existing = await client.query<{ manifest: string }>(
      "SELECT manifest FROM audit_dossier.results WHERE origin='worker-assignment' AND attempt_id=$1 AND slot='article-audit'",
      [audit.attemptId],
    );
    const saved: PublishedAudit = JSON.parse(existing.rows[0].manifest);
    if (
      saved.handoffSha256 !== handoffSha256 ||
      saved.resultRevision !== revision ||
      (previous &&
        (saved.report.artifactId !== previous.report.artifactId ||
          saved.coverage.artifactId !== previous.coverage.artifactId))
    )
      throw new Error("audit_publication_conflict");
    return saved;
  }
  // Общий порядок хешей исключает встречный захват одних и тех же материалов при параллельных публикациях.
  const blobs = new Map(
    [...sources.values()].map((source) => [source.sha256, source.bytes]),
  );
  blobs.set(audit.report.sha256, prepared.report);
  blobs.set(audit.coverage.sha256, prepared.coverage);
  const digests = [...blobs.keys()].sort();
  await client.query(
    `INSERT INTO audit_dossier.materials(sha,bytes)
     SELECT sha,bytes FROM unnest($1::text[],$2::bytea[]) AS m(sha,bytes) ORDER BY sha
     ON CONFLICT DO NOTHING`,
    [digests, digests.map((sha) => blobs.get(sha)!)],
  );
  const artifacts = await client.query(
    `INSERT INTO audit_dossier.artifacts(artifact_id,revision,result_id,kind,sha)
     VALUES($2,$6,$1,'report',$3),($4,$6,$1,'coverage',$5) ON CONFLICT DO NOTHING`,
    [
      audit.resultId,
      audit.report.artifactId,
      audit.report.sha256,
      audit.coverage.artifactId,
      audit.coverage.sha256,
      revision,
    ],
  );
  if (artifacts.rowCount !== 2) throw new Error("audit_publication_conflict");
  await client.query(
    `INSERT INTO audit_dossier.sources(result_id,path,sha)
     SELECT $1,p.path,p.sha FROM unnest($2::text[],$3::text[]) AS p(path,sha)`,
    [
      audit.resultId,
      [...sources.keys()],
      [...sources.values()].map((source) => source.sha256),
    ],
  );
  await client.query(
    "INSERT INTO audit_dossier.published_events(result_id,lane) VALUES ($1,$2)",
    [audit.resultId, previous ? "rework" : "initial"],
  );
  return audit;
}
