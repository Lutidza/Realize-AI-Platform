/**
 * @file packages/ai-contracts/src/SearchObservationManagement.types.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Описывает разрешённые Admin DTO хранения и состояния сборщиков поиска.
 */
import type { z } from "zod";
import type {
  searchObservationSettingsSchema,
  searchObservationSettingsUpdateSchema,
  searchObservationCleanupModeSchema,
  searchObservationCleanupPreviewSchema,
} from "./searchObservationManagement.schemas";

export type SearchObservationSettings = z.infer<
  typeof searchObservationSettingsSchema
>;
export type SearchObservationSettingsUpdate = z.infer<
  typeof searchObservationSettingsUpdateSchema
>;
export type SearchObservationCleanupMode = z.infer<
  typeof searchObservationCleanupModeSchema
>;
export type SearchObservationCleanupPreview = z.infer<
  typeof searchObservationCleanupPreviewSchema
>;

export type SearchObservationRuntimeStatus = {
  instanceID: string;
  source: "cli" | "mcp";
  startedAt: string;
  heartbeatAt: string;
  appliedRevision: number;
  state: "healthy" | "delayed" | "offline" | "degraded";
  queued: number;
  dropped: number;
  lastDeliveredAt: string | null;
  lastFailureAt: string | null;
  errorCode: "delivery_unavailable" | "buffer_unavailable" | null;
};

export type SearchObservationCleanupResult = {
  at: string;
  kind: "automatic" | "settings" | "expired" | "history";
  deletedCount: number;
  durationMs: number;
};

/** Receipt позволяет точно повторить запрос после потерянного HTTP-ответа. */
export type SearchObservationMutationResult = {
  requestID: string;
  revision: number;
  at: string;
  kind: "settings" | "expired" | "history";
  deletedCount: number;
};

export type SearchObservationManagement = {
  observedAt: string;
  revision: number;
  settings: SearchObservationSettings;
  storage: { count: number; bytes: number; oldestAt: string | null };
  clearedBefore: string | null;
  lastCleanup: SearchObservationCleanupResult | null;
  nextCleanupAt: string;
  runtimes: SearchObservationRuntimeStatus[];
  actions: SearchObservationMutationResult[];
};
