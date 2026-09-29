/**
 * @file packages/ai-contracts/src/searchObservationManagement.constants.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Задаёт серверные пределы и исходные настройки хранения диагностики.
 */
export const SEARCH_OBSERVATION_SETTINGS_LIMITS = Object.freeze({
  retentionDays: { min: 1, max: 7 },
  capacity: { min: 100, max: 10000 },
  cleanupIntervalMinutes: { min: 1, max: 60 },
});

export const SEARCH_OBSERVATION_DEFAULT_SETTINGS = Object.freeze({
  retentionDays: 7,
  capacity: 10000,
  cleanupIntervalMinutes: 1,
});

export const SEARCH_OBSERVATION_MANAGEMENT_LIMITS = Object.freeze({
  heartbeatMs: 10000,
  staleHeartbeatMs: 35000,
  offlineHeartbeatMs: 90000,
  runtimeCapacity: 32,
  runtimeRetentionMs: 86400000,
  actionCapacity: 20,
  previewLifetimeMs: 300000,
});
