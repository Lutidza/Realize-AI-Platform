/**
 * @file packages/payload-ai-plugin/src/endpoints/releaseWorkerReadiness.validator.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Проверяет готовность исполнителя принять новую подготовку OCI-кандидата.
 * @see documentation/architecture/codex-integration.md
 */

import { mapWorkerAvailability } from "../integrations/runtime/mapWorkerAvailability.mapper";
import type { WorkerPresenceSnapshot } from "../integrations/runtime/WorkerPresence.types";

/** Занятый исполнитель сохраняет очередь; отсутствие подходящего heartbeat запрещает новое задание. */
export const releaseWorkerUnavailableReason = (
  presence: WorkerPresenceSnapshot,
  changeRequestID: string,
): string | undefined => {
  const availability = mapWorkerAvailability(presence, {
    operation: "release",
    allowedChangeRequestID: changeRequestID,
  });
  return availability.state === "unavailable" ? availability.reason : undefined;
};
