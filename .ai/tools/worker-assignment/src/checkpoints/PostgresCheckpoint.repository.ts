/**
 * @file .ai/tools/worker-assignment/src/checkpoints/PostgresCheckpoint.repository.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Атомарно сохраняет ревизии попытки и подтверждения чтений под действующим lease.
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import { ASSIGNMENT_TEST_DATABASE } from "@realize/payload-task-manager/audit-review/test-database";
import { hashAuditText } from "./hashAuditText.util";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import type { AuditCheckpointState } from "./AuditCheckpoint.types";
import type {
  CheckpointLease,
  CheckpointSnapshot,
  ConfirmedRead,
} from "./Checkpoint.types";

/** При отсутствии номера возвращает последнюю зафиксированную ревизию. */
async function readSnapshot(
  client: PoolClient,
  attemptId: string,
  revision?: number,
): Promise<CheckpointSnapshot> {
  const result = await client.query(
    `SELECT revision, state_bytes, state_sha256 FROM audit_checkpoint.revisions
     WHERE attempt_id = $1 AND ($2::int IS NULL OR revision = $2)
     ORDER BY revision DESC LIMIT 1`,
    [attemptId, revision ?? null],
  );
  const row = result.rows[0];
  if (!row) throw new Error("checkpoint_missing");
  if (hashAuditText(row.state_bytes) !== row.state_sha256)
    throw new Error("checkpoint_corrupt");
  return {
    attemptId,
    revision: row.revision,
    state: JSON.parse(row.state_bytes),
  };
}

async function writeSnapshot(
  client: PoolClient,
  attemptId: string,
  revision: number,
  stateBytes: string,
) {
  await client.query(
    `INSERT INTO audit_checkpoint.revisions (attempt_id, revision, state_bytes, state_sha256)
     VALUES ($1, $2, $3, $4)`,
    [attemptId, revision, stateBytes, hashAuditText(stateBytes)],
  );
}

/** Использует только выделенную тестовую БД. Владельцем подключения и его завершения остаётся вызывающий код. */
export class PostgresCheckpointStore {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    let discard = false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL search_path TO pg_catalog");
      const database = await client.query("SELECT current_database() AS name");
      if (database.rows[0]?.name !== ASSIGNMENT_TEST_DATABASE)
        throw new Error("checkpoint_database_mismatch");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        discard = true;
      }
      throw error;
    } finally {
      client.release(discard);
    }
  }

  /** Последовательное создание схемы даже при одновременном старте двух процессов. */
  async initialize() {
    const schema = await readFile(
      new URL("./checkpointSchema.sql", import.meta.url),
      "utf8",
    );
    await this.transaction(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('realize.audit_checkpoint.schema'))",
      );
      await client.query(schema);
    });
  }

  /** Повтор создания с теми же байтами возвращает текущее состояние уже существующей попытки. */
  create(
    attemptId: string,
    initialState: AuditCheckpointState,
  ): Promise<CheckpointSnapshot> {
    const bytes = JSON.stringify(initialState);
    return this.transaction(async (client) => {
      const created = await client.query(
        "INSERT INTO audit_checkpoint.attempts (attempt_id) VALUES ($1) ON CONFLICT DO NOTHING",
        [attemptId],
      );
      if (created.rowCount) await writeSnapshot(client, attemptId, 0, bytes);
      else {
        const original = await readSnapshot(client, attemptId, 0);
        if (JSON.stringify(original.state) !== bytes)
          throw new Error("checkpoint_conflict");
      }
      return readSnapshot(client, attemptId);
    });
  }

  get(attemptId: string): Promise<CheckpointSnapshot> {
    return this.transaction((client) => readSnapshot(client, attemptId));
  }

  /** Выдаёт право одному владельцу по версии и времени БД. Каждый новый lease получает больший token. */
  claim(
    attemptId: string,
    revision: number,
    ownerId: string,
    leaseMs: number,
  ): Promise<CheckpointLease> {
    if (!ownerId || !Number.isSafeInteger(leaseMs) || leaseMs < 1)
      throw new Error("checkpoint_invalid_lease");
    return this.transaction(async (client) => {
      const claimed = await client.query(
        `UPDATE audit_checkpoint.attempts
         SET owner_id = $3, fence = fence + 1, expires_at = clock_timestamp() + $4 * interval '1 millisecond'
         WHERE attempt_id = $1 AND revision = $2 AND (owner_id IS NULL OR expires_at <= clock_timestamp())
         RETURNING fence::text`,
        [attemptId, revision, ownerId, leaseMs],
      );
      if (!claimed.rowCount) throw new Error("checkpoint_lease_unavailable");
      return { attemptId, ownerId, fence: claimed.rows[0].fence };
    });
  }

  /** Плановая остановка освобождает только собственный lease. Прежний token не может отозвать новый. */
  async release(lease: CheckpointLease) {
    await this.transaction(async (client) => {
      const freed = await client.query(
        `UPDATE audit_checkpoint.attempts SET owner_id = NULL, expires_at = NULL
         WHERE attempt_id = $1 AND owner_id = $2 AND fence = $3`,
        [lease.attemptId, lease.ownerId, lease.fence],
      );
      if (!freed.rowCount) throw new Error("checkpoint_lease_lost");
    });
  }

  /** Подтверждение и следующая ревизия фиксируются вместе. Точный повтор выдаёт сохранённую ревизию. */
  append(
    snapshot: CheckpointSnapshot,
    lease: CheckpointLease,
    nextState: AuditCheckpointState,
    receipt?: ConfirmedRead,
  ): Promise<CheckpointSnapshot> {
    const { attemptId, revision } = snapshot;
    const expectedBytes = JSON.stringify(snapshot.state);
    const nextBytes = JSON.stringify(nextState);
    // Отделяем входы от вызывающего процесса до первого await.
    const confirmed = receipt && structuredClone(receipt);
    const { ownerId, fence } = lease;
    if (
      lease.attemptId !== attemptId ||
      nextState.schemaVersion !== snapshot.state.schemaVersion ||
      JSON.stringify(nextState.identity) !==
        JSON.stringify(snapshot.state.identity) ||
      (confirmed && confirmed.operation.key.attemptId !== attemptId)
    ) {
      throw new Error("checkpoint_conflict");
    }
    return this.transaction(async (client) => {
      const head = await client.query(
        `SELECT revision FROM audit_checkpoint.attempts
         WHERE attempt_id = $1 AND owner_id = $2 AND fence = $3 AND expires_at > clock_timestamp() FOR UPDATE`,
        [attemptId, ownerId, fence],
      );
      if (!head.rowCount) throw new Error("checkpoint_lease_lost");
      const previous = await readSnapshot(client, attemptId, revision);
      if (JSON.stringify(previous.state) !== expectedBytes)
        throw new Error("checkpoint_conflict");
      const nextRevision = revision + 1;
      if (head.rows[0].revision !== revision) {
        if (!confirmed) throw new Error("checkpoint_conflict");
        const stored = await client.query(
          `SELECT receipt_bytes FROM audit_checkpoint.receipts
           WHERE attempt_id = $1 AND revision = $2`,
          [attemptId, nextRevision],
        );
        if (stored.rows[0]?.receipt_bytes !== JSON.stringify(confirmed))
          throw new Error("checkpoint_conflict");
        const repeated = await readSnapshot(client, attemptId, nextRevision);
        if (JSON.stringify(repeated.state) !== nextBytes)
          throw new Error("checkpoint_conflict");
        return repeated;
      }
      await writeSnapshot(client, attemptId, nextRevision, nextBytes);
      if (confirmed) {
        const inserted = await client.query(
          `INSERT INTO audit_checkpoint.receipts (attempt_id, revision, call_id, request_id, receipt_bytes)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
          [
            attemptId,
            nextRevision,
            confirmed.operation.key.toolCallId,
            confirmed.requestId,
            JSON.stringify(confirmed),
          ],
        );
        if (!inserted.rowCount) throw new Error("checkpoint_conflict");
      }
      const advanced = await client.query(
        `UPDATE audit_checkpoint.attempts SET revision = $4
         WHERE attempt_id = $1 AND owner_id = $2 AND fence = $3 AND expires_at > clock_timestamp()`,
        [attemptId, ownerId, fence, nextRevision],
      );
      if (!advanced.rowCount) throw new Error("checkpoint_lease_lost");
      return {
        attemptId,
        revision: nextRevision,
        state: JSON.parse(nextBytes),
      };
    });
  }

  /** Возвращает только подтверждённые операции этой попытки в порядке фиксации. */
  receipts(attemptId: string): Promise<ConfirmedRead[]> {
    return this.transaction(async (client) => {
      const records = await client.query(
        "SELECT receipt_bytes FROM audit_checkpoint.receipts WHERE attempt_id = $1 ORDER BY revision",
        [attemptId],
      );
      return records.rows.map((row) => JSON.parse(row.receipt_bytes));
    });
  }
}
