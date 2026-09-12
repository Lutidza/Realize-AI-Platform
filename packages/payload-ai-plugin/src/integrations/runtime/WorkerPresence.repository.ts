/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/WorkerPresence.repository.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Записывает heartbeat и читает свежесть исполнителей по часам PostgreSQL.
 */

import type { IntegrationRegistryDatabase } from "./IntegrationRuntime.types";
import type {
  WorkerPresenceRow,
  WorkerPresenceSnapshot,
  WorkerPresenceUpdate,
} from "./WorkerPresence.types";

export const WORKER_HEARTBEAT_INTERVAL_MS = 5_000;
export const WORKER_HEARTBEAT_STALE_MS = 20_000;

/** Экземпляр идентифицируется случайным session key, поэтому перезапуски и несколько worker не затирают друг друга. */
export class WorkerPresenceRepository {
  constructor(private readonly database: IntegrationRegistryDatabase) {}

  async write(update: WorkerPresenceUpdate): Promise<void> {
    await this.database.query(
      `INSERT INTO realize_ai_worker_presence
        (instance_key, state, last_seen_at, capabilities, current_kind, current_change_request, created_at, updated_at)
       VALUES ($1, $2, clock_timestamp(), $3::jsonb, $4, $5, clock_timestamp(), clock_timestamp())
       ON CONFLICT (instance_key) DO UPDATE SET
         state = EXCLUDED.state, last_seen_at = EXCLUDED.last_seen_at,
         capabilities = EXCLUDED.capabilities, current_kind = EXCLUDED.current_kind,
         current_change_request = EXCLUDED.current_change_request, updated_at = EXCLUDED.updated_at`,
      [
        update.instanceKey,
        update.state,
        JSON.stringify(update.capabilities),
        update.currentJob?.kind ?? null,
        update.currentJob?.changeRequestID ?? null,
      ],
    );
  }

  /** Сохраняется последний недоступный экземпляр и все свежие; история старше суток не является аудитом. */
  async cleanup(): Promise<void> {
    await this.database.query(`DELETE FROM realize_ai_worker_presence
      WHERE last_seen_at < clock_timestamp() - INTERVAL '1 day'
        AND instance_key <> (SELECT instance_key FROM realize_ai_worker_presence ORDER BY last_seen_at DESC LIMIT 1)`);
  }

  async read(assignedInstanceKey?: string): Promise<WorkerPresenceSnapshot> {
    try {
      const result = await this.database.query<WorkerPresenceRow>(
        `SELECT instance_key, state, last_seen_at, capabilities, current_kind, current_change_request,
          last_seen_at > clock_timestamp() - $1 * INTERVAL '1 millisecond' AS fresh
         FROM realize_ai_worker_presence
         WHERE last_seen_at > clock_timestamp() - $1 * INTERVAL '1 millisecond'
           OR instance_key = (SELECT instance_key FROM realize_ai_worker_presence ORDER BY last_seen_at DESC LIMIT 1)
           OR instance_key = $2
         ORDER BY last_seen_at DESC`,
        [WORKER_HEARTBEAT_STALE_MS, assignedInstanceKey ?? null],
      );
      return { rows: result.rows, readable: true };
    } catch {
      return { rows: [], readable: false };
    }
  }
}
