/**
 * @file packages/payload-ai-plugin/src/endpoints/pagePublicationSnapshot.mapper.ts
 * @version 2.0.0
 * @date 2026-09-14
 * @description Проверяет закрытый снимок публикации и формирует его ограниченную идентичность.
 */
import {
  parseIdentifier,
  parsePagePublicationPreview,
  parseApplyDataOperationInput,
} from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import type { PagePublicationSnapshot } from "./PagePublication.types";
import { EndpointError } from "./http";
import type { AIDocument } from "./repository";

export const pagePublicationRef = (page: AIDocument) => ({
  id: parseIdentifier(String(page.id), "page id"),
  title: String(page.title ?? ""),
  ...(typeof page.slug === "string" ? { slug: page.slug } : {}),
});
export const pagePublicationOperationHash = (
  snapshot: PagePublicationSnapshot,
) =>
  hashCanonicalJSON({
    kind:
      snapshot.mode === "publish"
        ? "pages.publishDraft.v1"
        : "pages.restorePublication.v1",
    version: "1.0",
    snapshot,
  });

/** Снимки защищены collection access, но повреждённое persisted состояние не допускается к записи. */
export const readPagePublicationSnapshot = (
  operation: AIDocument,
): PagePublicationSnapshot => {
  const value = operation.afterSnapshot as PagePublicationSnapshot | undefined;
  const intent = operation.intent as Record<string, unknown> | undefined;
  if (
    !value ||
    value.version !== "1.0" ||
    !["publish", "restore"].includes(value.mode) ||
    !value.source ||
    !value.revision?.page ||
    !value.beforePage ||
    !value.targetPage ||
    !value.preservedDraft ||
    Buffer.byteLength(JSON.stringify(value), "utf8") > 4 * 1024 * 1024
  )
    throw new EndpointError(
      "CONFLICT",
      "Снимок публикации недоступен или повреждён.",
      409,
    );
  const kind =
    value.mode === "publish"
      ? "pages.publishDraft.v1"
      : "pages.restorePublication.v1";
  const preview = parsePagePublicationPreview(value.preview);
  parseApplyDataOperationInput({
    expectedVersion: value.source.version,
    expectedOperationHash: value.source.operationHash,
  });
  parseIdentifier(value.source.id, "source operation id");
  if (
    operation.kind !== kind ||
    intent?.kind !== kind ||
    intent?.version !== "1.0" ||
    intent?.sourceOperationID !== value.source.id ||
    preview.sourceOperationID !== value.source.id ||
    [
      value.revision.page,
      value.beforePage,
      value.targetPage,
      value.preservedDraft,
    ].some((page) => String(page.id) !== preview.page.id) ||
    pagePublicationOperationHash(value) !== operation.operationHash
  )
    throw new EndpointError(
      "CONFLICT",
      "Снимок не соответствует подтверждаемой публикации.",
      409,
    );
  return value;
};
