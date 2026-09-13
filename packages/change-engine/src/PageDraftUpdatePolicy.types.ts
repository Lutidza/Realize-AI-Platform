/**
 * @file packages/change-engine/src/PageDraftUpdatePolicy.types.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Связывает подтверждения редактирования страницы с точными серверными снимками.
 */
import type { UpdatePageDraftIntent } from "@realize/ai-contracts";

export type PageDraftUpdateOperationHashInput = {
  intent: UpdatePageDraftIntent;
  snapshotHash: string;
};

export type PageDraftUpdateRollbackHashInput = {
  operationHash: string;
} & (
  | {
      pageID: string;
      updatedAt: string;
      fingerprint: string;
      adapterVersion: string;
    }
  | {
      pageID?: never;
      updatedAt?: never;
      fingerprint?: never;
      adapterVersion?: never;
    }
);
