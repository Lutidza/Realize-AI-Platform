/**
 * @file packages/payload-task-manager/src/server/audit-review/AuditDossier.repository.ts
 * @version 1.2.0
 * @date 2026-11-25
 * @description Публикует неизменяемый результат аудита вместе с материалами и подтверждает его доставку в очередь.
 * @see documentation/specifications/task-management/execution/article-audit-publication.md
 */
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import type { Pool, PoolClient } from "pg";
import type {
  AuditPublication,
  PublishedAudit,
  ReviewDelivery,
} from "./AuditPublication.types";
import {
  assertAuditOrigin,
  assertReviewRead,
  assertReviewRoute,
  resolveReviewTarget,
} from "./auditReviewPlan.repository";
import { persistAuditResult } from "./persistAuditResult.repository";
import { prepareAuditMaterials } from "./prepareAuditMaterials.mapper";
import { withAuditTransaction } from "./withAuditTransaction.repository";
import { assertIterationDelivery } from "./rework/reviewIterationDelivery.repository";

const resultIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

/** Внутренний снимок результата. Выдача материалов пользователю требует проверки прав вызывающей операции. */
export async function loadAuditResult(
  client: PoolClient,
  resultId: string,
): Promise<PublishedAudit> {
  if (!resultIdPattern.test(resultId))
    throw new Error("audit_result_unavailable");
  const result = await client.query<{ manifest: string }>(
    "SELECT manifest FROM audit_dossier.results WHERE result_id=$1",
    [resultId],
  );
  if (!result.rowCount) throw new Error("audit_result_unavailable");
  return JSON.parse(result.rows[0].manifest);
}

/** Проверяется внутри транзакции получателя. Поля конверта должны совпадать с выданными досье. */
export async function assertPublishedDelivery(
  client: PoolClient,
  delivery: ReviewDelivery,
) {
  if (!resultIdPattern.test(delivery.resultId))
    throw new Error("audit_delivery_conflict");
  if (delivery.rework) {
    await assertIterationDelivery(client, delivery);
    return;
  }
  const result = await client.query<{ envelope: string }>(
    "SELECT envelope FROM audit_dossier.deliveries WHERE result_id=$1",
    [delivery.resultId],
  );
  if (
    !result.rowCount ||
    !isDeepStrictEqual(JSON.parse(result.rows[0].envelope), delivery)
  )
    throw new Error("audit_delivery_conflict");
}

/** Возвращает закреплённые байты под блокировкой прав в транзакции вызывающего. */
export async function readAuditArtifact(
  client: PoolClient,
  resultId: string,
  kind: "report" | "coverage",
  actorId: string,
): Promise<Buffer> {
  const result = await loadAuditResult(client, resultId);
  await assertReviewRead(client, result.task, actorId);
  const row = await client.query<{ bytes: Buffer }>(
    `SELECT m.bytes FROM audit_dossier.artifacts a JOIN audit_dossier.materials m USING(sha)
         WHERE a.result_id=$1 AND a.kind=$2 AND a.artifact_id=$3 AND a.revision=$4 AND a.sha=$5`,
    [
      resultId,
      kind,
      result[kind].artifactId,
      result[kind].revision,
      result[kind].sha256,
    ],
  );
  if (!row.rowCount) throw new Error("audit_material_unavailable");
  return row.rows[0].bytes;
}

/** Возвращает закреплённые байты под блокировкой прав в транзакции вызывающего. */
export async function readAuditSource(
  client: PoolClient,
  resultId: string,
  path: string,
  actorId: string,
): Promise<Buffer> {
  const result = await loadAuditResult(client, resultId);
  await assertReviewRead(client, result.task, actorId);
  const row = await client.query<{ bytes: Buffer }>(
    `SELECT m.bytes FROM audit_dossier.sources s JOIN audit_dossier.materials m USING(sha)
         WHERE s.result_id=$1 AND s.path=$2`,
    [resultId, path],
  );
  if (!row.rowCount) throw new Error("audit_material_unavailable");
  return row.rows[0].bytes;
}

/** Предоставляет серверные операции досье. Идентичность вызывающего определяет авторизованный адаптер. */
export class AuditDossierRepository {
  constructor(private readonly pool: Pool) {}

  async initialize() {
    const schema = await readFile(
      new URL("./dossierSchema.sql", import.meta.url),
      "utf8",
    );
    await withAuditTransaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('realize.audit_dossier.schema'))",
      );
      await client.query(schema);
    });
  }

  /** В одной транзакции регистрирует версии материалов, результат и событие, которое сможет забрать диспетчер. */
  async publish(input: AuditPublication): Promise<PublishedAudit> {
    const prepared = prepareAuditMaterials(input);
    const { manifest } = prepared;
    return withAuditTransaction(this.pool, async (client) => {
      await assertAuditOrigin(
        client,
        manifest.task,
        manifest.attemptId,
        prepared.sourcePins,
        prepared.scopePins,
      );
      return persistAuditResult(client, prepared);
    });
  }

  /** Выдаёт только те опубликованные версии задачи, на которые участник сейчас имеет права. */
  listTaskResults(taskId: string, actorId: string): Promise<PublishedAudit[]> {
    return withAuditTransaction(this.pool, async (client) => {
      const rows = await client.query<{ manifest: string }>(
        "SELECT manifest FROM audit_dossier.results WHERE task_id=$1 ORDER BY created_at,result_id",
        [taskId],
      );
      const allowed: PublishedAudit[] = [];
      for (const row of rows.rows) {
        const result: PublishedAudit = JSON.parse(row.manifest);
        try {
          await assertReviewRead(client, result.task, actorId);
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "review_access_denied"
          )
            continue;
          throw error;
        }
        allowed.push(result);
      }
      return allowed;
    });
  }

  /** Каждое чтение привязано к доступной ревизии исходной задачи. */
  readResult(resultId: string, actorId: string): Promise<PublishedAudit> {
    return withAuditTransaction(this.pool, async (client) => {
      const result = await loadAuditResult(client, resultId);
      await assertReviewRead(client, result.task, actorId);
      return result;
    });
  }

  readArtifact(resultId: string, kind: "report" | "coverage", actorId: string) {
    return withAuditTransaction(this.pool, (client) =>
      readAuditArtifact(client, resultId, kind, actorId),
    );
  }

  readSource(resultId: string, path: string, actorId: string) {
    return withAuditTransaction(this.pool, (client) =>
      readAuditSource(client, resultId, path, actorId),
    );
  }

  /** Потребитель может повторить опрос после рестарта, пока досье не получило квитанцию очереди. */
  pendingEvents(): Promise<string[]> {
    return withAuditTransaction(this.pool, async (client) => {
      const events = await client.query<{ result_id: string }>(
        `SELECT e.result_id FROM audit_dossier.published_events e
         LEFT JOIN audit_dossier.acknowledgements a USING(result_id)
         WHERE a.job_id IS NULL AND e.lane='initial' ORDER BY e.created_at,e.result_id`,
      );
      return events.rows.map((row) => row.result_id);
    });
  }

  /** Источник реквизитов — неизменяемый результат и подтверждённое назначение из плана. */
  prepareDelivery(resultId: string): Promise<ReviewDelivery> {
    return withAuditTransaction(this.pool, async (client) => {
      const { task, resultRevision, report, coverage } = await loadAuditResult(
        client,
        resultId,
      );
      const target = await resolveReviewTarget(client, task);
      if (resultRevision !== 1) throw new Error("review_iteration_required");
      const delivery: ReviewDelivery = {
        task,
        resultId,
        resultRevision,
        report,
        coverage,
        target,
      };
      await assertReviewRoute(client, delivery);
      await client.query(
        "INSERT INTO audit_dossier.deliveries(result_id,envelope) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [resultId, JSON.stringify(delivery)],
      );
      await assertPublishedDelivery(client, delivery);
      return delivery;
    });
  }

  /** Фиксирует один authoritative job ID. Точный повтор квитанции завершает уже принятую доставку. */
  async acknowledge(delivery: ReviewDelivery, jobId: string) {
    const envelope = structuredClone(delivery);
    if (!jobId || envelope.rework) throw new Error("audit_delivery_conflict");
    await withAuditTransaction(this.pool, async (client) => {
      await assertPublishedDelivery(client, envelope);
      await client.query(
        "INSERT INTO audit_dossier.acknowledgements(result_id,job_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [envelope.resultId, jobId],
      );
      const ack = await client.query<{ job_id: string }>(
        "SELECT job_id FROM audit_dossier.acknowledgements WHERE result_id=$1",
        [envelope.resultId],
      );
      if (ack.rows[0]?.job_id !== jobId)
        throw new Error("audit_delivery_conflict");
    });
  }
}
