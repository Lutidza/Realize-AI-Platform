/**
 * @file .ai/tools/agent-search/src/importResolution.config.d.mts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Описывает общий runtime budget без повторного объявления значений в потребителях.
 * @see documentation/architecture/repository-search.md
 */
export const IMPORT_RESOLUTION_LIMITS: Readonly<{
  defaultDepth: number;
  maxDepth: number;
  files: number;
  bytes: number;
  probes: number;
  directoryEntries: number;
  configDepth: number;
  graphEntries: number;
  matches: number;
  inventoryEntries: number;
  inventoryBytes: number;
}>;
