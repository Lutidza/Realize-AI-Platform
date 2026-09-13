/**
 * @file packages/change-engine/src/pageDraftUpdatePolicy.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Вычисляет hash точного изменения текста страницы и его компенсирующего отката.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import { hashCanonicalJSON } from "./canonicalJson";
import type {
  PageDraftUpdateOperationHashInput,
  PageDraftUpdateRollbackHashInput,
} from "./PageDraftUpdatePolicy.types";

/** Подтверждение включает полный before snapshot, host patch, preview и версии схемы/данных. */
export const createPageDraftUpdateOperationHash = (
  input: PageDraftUpdateOperationHashInput,
): string =>
  hashCanonicalJSON({
    ...input,
    kind: "pages.updateDraft.v1",
    rollbackStrategy: "before-snapshot",
    status: "draft",
  });

/** После apply rollback разрешён только для одной неизменённой версии страницы. */
export const createPageDraftUpdateRollbackHash = (
  input: PageDraftUpdateRollbackHashInput,
): string => {
  const fields = [
    input.pageID,
    input.updatedAt,
    input.fingerprint,
    input.adapterVersion,
  ];
  if (
    fields.some((value) => value !== undefined) &&
    fields.some((value) => !value)
  )
    throw new Error(
      "Page draft update rollback requires a complete applied snapshot.",
    );
  return hashCanonicalJSON({
    operationHash: input.operationHash,
    ...(input.pageID
      ? {
          pageID: input.pageID,
          updatedAt: input.updatedAt,
          fingerprint: input.fingerprint,
          adapterVersion: input.adapterVersion,
        }
      : {}),
    kind: "pages.updateDraft.rollback.v1",
    rollbackStrategy: "before-snapshot",
    state: input.pageID ? "applied" : "not-applied",
  });
};
