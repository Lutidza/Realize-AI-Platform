/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/WorkerPresence.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Задаёт серверный снимок heartbeat без process IDs, путей и секретов.
 */

import type {
  WorkerAvailabilityDTO,
  WorkerJobKind,
} from "@realize/ai-contracts";

export type WorkerCapabilities = Record<WorkerJobKind, boolean>;
export type WorkerPresenceState =
  "idle" | "busy" | "draining" | "stopped" | "error";
export type WorkerPresenceUpdate = {
  instanceKey: string;
  state: WorkerPresenceState;
  capabilities: WorkerCapabilities;
  currentJob: WorkerAvailabilityDTO["currentJob"];
};
/** Поля SQL проходят явный mapper; fresh вычисляется по времени того же PostgreSQL. */
export type WorkerPresenceRow = {
  instance_key: string;
  state: WorkerPresenceState;
  last_seen_at: Date | string;
  fresh: boolean;
  capabilities: unknown;
  current_kind: WorkerJobKind | null;
  current_change_request: string | null;
};
export type WorkerPresenceSnapshot = {
  rows: WorkerPresenceRow[];
  readable: boolean;
};

/** Привязка к assigned instance проверяет именно claimed задание; chat scope ограничивает его видимость. */
export type WorkerAvailabilityOptions = {
  assignedInstanceKey?: string;
  operation?: WorkerJobKind;
  allowedChangeRequestID?: string;
  disabledReason?: string;
};
