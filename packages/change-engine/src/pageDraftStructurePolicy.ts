/**
 * @file packages/change-engine/src/pageDraftStructurePolicy.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Отделяет hashes структурной операции и отката от прежних текстовых планов.
 */
import { hashCanonicalJSON } from "./canonicalJson";
import type {
  PageDraftStructureOperationHashInput,
  PageDraftStructureRollbackHashInput,
} from "./PageDraftStructurePolicy.types";

export const createPageDraftStructureOperationHash = (
  input: PageDraftStructureOperationHashInput,
): string =>
  hashCanonicalJSON({
    ...input,
    kind: "pages.updateStructureDraft.v1",
    rollbackStrategy: "before-snapshot",
    status: "draft",
  });

/** После записи требуются все поля одной применённой ревизии, включая каталог. */
export const createPageDraftStructureRollbackHash = (
  input: PageDraftStructureRollbackHashInput,
): string => {
  const fields = [
    input.pageID,
    input.updatedAt,
    input.fingerprint,
    input.adapterVersion,
    input.catalogHash,
  ];
  if (
    fields.some((value) => value !== undefined) &&
    fields.some((value) => !value)
  )
    throw new Error("Structure rollback requires a complete applied snapshot.");
  return hashCanonicalJSON({
    operationHash: input.operationHash,
    ...(input.pageID
      ? {
          pageID: input.pageID,
          updatedAt: input.updatedAt,
          fingerprint: input.fingerprint,
          adapterVersion: input.adapterVersion,
          catalogHash: input.catalogHash,
        }
      : {}),
    kind: "pages.updateStructureDraft.rollback.v1",
    rollbackStrategy: "before-snapshot",
    state: input.pageID ? "applied" : "not-applied",
  });
};
