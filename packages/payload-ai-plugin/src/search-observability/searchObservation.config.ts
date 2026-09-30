/**
 * @file packages/payload-ai-plugin/src/search-observability/searchObservation.config.ts
 * @version 1.1.0
 * @date 2026-09-28
 * @description Задаёт проверяемые пределы временной диагностики без ослабления политики поиска.
 */
import { SEARCH_OBSERVATION_DEFAULT_SETTINGS } from "@realize/ai-contracts";

export const SEARCH_OBSERVATION_POLICY = Object.freeze({
  retentionDays: SEARCH_OBSERVATION_DEFAULT_SETTINGS.retentionDays,
  capacity: SEARCH_OBSERVATION_DEFAULT_SETTINGS.capacity,
  queueCapacity: 100,
  slowMs: 1000,
});
export const SEARCH_OBSERVATION_SLUG = "realize-ai-search-observations";
export const SEARCH_OBSERVATION_STATE_SLUG = "realize-ai-search-state";
export const SEARCH_OBSERVATION_INITIAL_STATE = {
  revision: 1,
  settings: SEARCH_OBSERVATION_DEFAULT_SETTINGS,
  clearedBefore: null,
  lastCleanup: null,
  runtimes: [],
  actions: [],
};
