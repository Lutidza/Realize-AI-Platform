/**
 * @file packages/payload-ai-plugin/src/endpoints/lockPageDraftWrites.hook.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Сериализует изменения страниц, включая autosave, с управляемым откатом.
 */
import type { CollectionBeforeOperationHook } from "payload";
import { lockAITransaction } from "./lockAITransaction.util";

/** Payload уже открыл транзакцию до beforeOperation; draft пишет версии, а не основную строку. */
export const lockPageDraftWrites: CollectionBeforeOperationHook = async ({
  args,
  operation,
  req,
}) => {
  if (["create", "update", "delete", "restoreVersion"].includes(operation))
    await lockAITransaction(req, "page-drafts");
  return args;
};
