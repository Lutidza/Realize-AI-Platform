/**
 * @file packages/change-engine/src/PageDraftStructurePolicy.types.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Связывает подтверждение структуры с intent, полным снимком и версией каталога.
 */
import type { UpdatePageStructureDraftIntent } from "@realize/ai-contracts";
export type PageDraftStructureOperationHashInput = {
  intent: UpdatePageStructureDraftIntent;
  snapshotHash: string;
};
export type PageDraftStructureRollbackHashInput = {
  operationHash: string;
  pageID?: string;
  updatedAt?: string;
  fingerprint?: string;
  adapterVersion?: string;
  catalogHash?: string;
};
