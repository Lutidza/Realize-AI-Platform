/**
 * @file services/ai-execution-worker/src/WorkerHeartbeat.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Задаёт порт записи heartbeat и вход локального lifecycle исполнителя.
 */

import type { WorkerPresenceUpdate } from "@realize/payload-ai-control/server/integration-runtime";

export type WorkerHeartbeatWriter = {
  write: (update: WorkerPresenceUpdate) => Promise<void>;
};
