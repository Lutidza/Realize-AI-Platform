/**
 * @file packages/ai-contracts/src/designWorkshop.constants.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Ограничивает объём текстовых drafts и истории первой поставки Мастерской.
 * @see documentation/specifications/design-workshop.md
 */
export const DESIGN_WORKSHOP_LIMITS = {
  files: 64,
  fileBytes: 128 * 1024,
  snapshotFileBytes: 1024 * 1024,
  // JSON escaping может занимать шесть байтов на один байт исходного текста.
  requestBytes: 8 * 1024 * 1024,
  projectsPerOwner: 20,
  revisionsPerProject: 100,
  changesPerProject: 100,
  changeTtlMs: 24 * 60 * 60 * 1000,
  pageSize: 20,
} as const;
