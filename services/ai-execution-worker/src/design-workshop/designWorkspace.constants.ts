/**
 * @file services/ai-execution-worker/src/design-workshop/designWorkspace.constants.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Ограничивает служебные записи и незавершённые попытки материализации.
 * @see documentation/specifications/design-workshop.md
 */
export const DESIGN_WORKSPACE_STORAGE = {
  manifest: ".realize-manifest.json",
  identity: ".realize-binding.json",
  checkpoint: "checkpoint.json",
  metadataBytes: 128 * 1024,
  attemptsPerBinding: 64,
  maximumDirectories: 1024,
} as const;
