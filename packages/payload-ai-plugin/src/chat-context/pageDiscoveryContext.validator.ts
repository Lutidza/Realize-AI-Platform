/**
 * @file packages/payload-ai-plugin/src/chat-context/pageDiscoveryContext.validator.ts
 * @version 1.1.0
 * @date 2026-09-13
 * @description Проверяет совпадение предложения с сохранённым выбором или чтением того же запуска.
 */
import {
  parsePageDraftContext,
  type UpdatePageDraftIntent,
} from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import type { ChatRunContext } from "./ChatRunContext.types";

/** Публичный intent не может добавить snapshot; принимаются только источники persisted run. */
export const matchesPageDiscoveryContext = (
  stored: unknown,
  intent: UpdatePageDraftIntent,
): boolean => {
  if (!stored || typeof stored !== "object" || Array.isArray(stored))
    return false;
  const context = stored as ChatRunContext;
  const candidates: unknown[] = context.pageDraftContext
    ? [context.pageDraftContext]
    : [];
  if (context.pageDiscoveryEnabled && context.pageReadContexts !== undefined) {
    if (
      !Array.isArray(context.pageReadContexts) ||
      context.pageReadContexts.length > 3 ||
      Buffer.byteLength(
        JSON.stringify([
          context.pageReadContexts,
          context.pageStructureReadContexts ?? [],
        ]),
        "utf8",
      ) >
        384 * 1024 ||
      !Array.isArray(context.pageDiscoveryCalls) ||
      context.pageDiscoveryCalls.length > 12
    )
      return false;
    for (const read of context.pageReadContexts) {
      if (!read || typeof read !== "object") return false;
      const requestHash = hashCanonicalJSON({
        name: "pages_read",
        arguments: { pageID: intent.pageID },
      });
      if (
        read.requestHash === requestHash &&
        context.pageDiscoveryCalls.some(
          (call) =>
            call.callID === read.callID &&
            call.requestHash === requestHash &&
            call.name === "pages_read" &&
            call.status === "completed",
        )
      )
        candidates.push(read.context);
    }
  }
  return candidates.some((candidate) => {
    try {
      const snapshot = parsePageDraftContext(candidate);
      return (
        snapshot.page.id === intent.pageID &&
        snapshot.updatedAt === intent.expectedUpdatedAt &&
        snapshot.fingerprint === intent.expectedFingerprint &&
        intent.changes.every((change) =>
          snapshot.fields.some(
            (field) =>
              field.path === change.path && field.value === change.before,
          ),
        )
      );
    } catch {
      return false;
    }
  });
};
