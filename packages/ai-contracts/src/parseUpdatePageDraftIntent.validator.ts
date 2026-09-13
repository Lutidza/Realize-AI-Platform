/**
 * @file packages/ai-contracts/src/parseUpdatePageDraftIntent.validator.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Проверяет точные текстовые изменения черновика и привязку к серверной ревизии.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import type {
  PageDraftTextChange,
  UpdatePageDraftIntent,
} from "./PageDraftUpdate.types";
import { pageDraftTextValidation } from "./parsePageDraftContext.validator";
import { ContractValidationError, parseIdentifier } from "./validation";

/** Общая проверка diff для model intent и host adapter; before никогда не trim-ится. */
export const parsePageDraftTextChanges = (
  value: unknown,
): PageDraftTextChange[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) {
    throw new ContractValidationError(
      "page changes must contain between 1 and 32 items.",
    );
  }
  const paths = new Set<string>();
  let totalBytes = 0;
  return value.map((value) => {
    const change = pageDraftTextValidation.object(
      value,
      ["path", "before", "after"],
      "page text change",
    );
    const path = pageDraftTextValidation.path(change.path);
    const maxLength = pageDraftTextValidation.maxLength(path);
    const before = pageDraftTextValidation.text(
      change.before,
      "before text",
      maxLength,
    );
    const after = pageDraftTextValidation.text(
      change.after,
      "after text",
      maxLength,
      true,
    );
    totalBytes += new TextEncoder().encode(before + after).byteLength;
    if (paths.has(path) || before === after || totalBytes > 32 * 1024) {
      throw new ContractValidationError(
        "page diff contains a duplicate, unchanged value or exceeds 32 KiB.",
      );
    }
    if (path === "/title" && !after.trim()) {
      throw new ContractValidationError("page title must not be empty.");
    }
    paths.add(path);
    return { path, before, after };
  });
};

/** Модель предлагает только diff: Payload доступ и исходный fingerprint проверяет сервис. */
export const parseUpdatePageDraftIntent = (
  value: unknown,
): UpdatePageDraftIntent => {
  const input = pageDraftTextValidation.object(
    value,
    [
      "version",
      "kind",
      "pageID",
      "expectedUpdatedAt",
      "expectedFingerprint",
      "changes",
    ],
    "page update operation",
  );
  if (input.version !== "1.0" || input.kind !== "pages.updateDraft.v1") {
    throw new ContractValidationError(
      "page update operation kind or version is not supported.",
    );
  }
  return {
    version: "1.0",
    kind: "pages.updateDraft.v1",
    pageID: parseIdentifier(input.pageID, "page id"),
    expectedUpdatedAt: pageDraftTextValidation.date(input.expectedUpdatedAt),
    expectedFingerprint: pageDraftTextValidation.hash(
      input.expectedFingerprint,
    ),
    changes: parsePageDraftTextChanges(input.changes),
  };
};
