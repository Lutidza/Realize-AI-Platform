/**
 * @file packages/payload-ai-plugin/src/search-observability/mapSearchObservationControl.mapper.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Формирует разрешённый снимок диагностики без закрытых данных административных операций.
 */
import {
  SEARCH_OBSERVATION_MANAGEMENT_LIMITS as limits,
  type SearchObservationManagement,
} from "@realize/ai-contracts";
import type {
  SearchObservationControlState,
  SearchObservationStorage,
} from "./SearchObservationControl.types";

export function mapSearchObservationControl(
  state: SearchObservationControlState,
  storage: SearchObservationStorage,
  now: number,
): SearchObservationManagement {
  return {
    observedAt: new Date(now).toISOString(),
    revision: state.revision,
    settings: {
      retentionDays: state.settings.retentionDays,
      capacity: state.settings.capacity,
      cleanupIntervalMinutes: state.settings.cleanupIntervalMinutes,
    },
    storage: {
      count: storage.count,
      bytes: storage.bytes,
      oldestAt: storage.oldestAt,
    },
    clearedBefore: state.clearedBefore,
    lastCleanup: state.lastCleanup
      ? {
          at: state.lastCleanup.at,
          kind: state.lastCleanup.kind,
          deletedCount: state.lastCleanup.deletedCount,
          durationMs: state.lastCleanup.durationMs,
        }
      : null,
    nextCleanupAt: new Date(
      state.lastCleanup
        ? Date.parse(state.lastCleanup.at) +
            state.settings.cleanupIntervalMinutes * 60000
        : now,
    ).toISOString(),
    runtimes: state.runtimes.map((runtime) => {
      const age = now - Date.parse(runtime.heartbeatAt);
      return {
        instanceID: runtime.instanceID,
        source: runtime.source,
        startedAt: runtime.startedAt,
        heartbeatAt: runtime.heartbeatAt,
        appliedRevision: runtime.appliedRevision,
        state:
          age > limits.offlineHeartbeatMs
            ? "offline"
            : age > limits.staleHeartbeatMs
              ? "delayed"
              : runtime.errorCode
                ? "degraded"
                : "healthy",
        queued: runtime.queued,
        dropped: runtime.dropped,
        lastDeliveredAt: runtime.lastDeliveredAt,
        lastFailureAt: runtime.lastFailureAt,
        errorCode: runtime.errorCode,
      };
    }),
    actions: state.actions.map((action) => ({
      requestID: action.requestID,
      revision: action.revision,
      at: action.at,
      kind: action.kind,
      deletedCount: action.deletedCount,
    })),
  };
}
