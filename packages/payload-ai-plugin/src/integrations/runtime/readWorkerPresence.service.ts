/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/readWorkerPresence.service.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Читает состояние worker через штатный Payload pool, не создавая подключений на запрос.
 */

import type { PayloadRequest } from "payload";
import type { IntegrationRegistryDatabase } from "./IntegrationRuntime.types";
import { WorkerPresenceRepository } from "./WorkerPresence.repository";
import type { WorkerPresenceSnapshot } from "./WorkerPresence.types";

/** Отсутствующая миграция или недоступная БД превращается в безопасную диагностику, не ломая историю чата. */
export const readWorkerPresence = async (
  req: PayloadRequest,
  assignedInstanceKey?: string,
): Promise<WorkerPresenceSnapshot> => {
  const database = req.payload.db as unknown as {
    pool?: IntegrationRegistryDatabase;
  };
  return database.pool
    ? new WorkerPresenceRepository(database.pool).read(assignedInstanceKey)
    : { rows: [], readable: false };
};
