/**
 * @file .ai/tools/agent-search/src/importResolution.config.mjs
 * @version 1.0.0
 * @date 2026-09-28
 * @description Задаёт общие пределы одного запроса навигации по импорту и re-export.
 */
export const IMPORT_RESOLUTION_LIMITS = Object.freeze({
  defaultDepth: 8,
  maxDepth: 12,
  files: 128,
  bytes: 4 * 1024 * 1024,
  probes: 1024,
  directoryEntries: 256,
  configDepth: 8,
  graphEntries: 2048,
  matches: 1000,
  inventoryEntries: 10000,
  inventoryBytes: 2 * 1024 * 1024,
});
