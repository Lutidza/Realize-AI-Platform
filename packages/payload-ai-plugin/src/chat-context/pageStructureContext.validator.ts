/**
 * @file packages/payload-ai-plugin/src/chat-context/pageStructureContext.validator.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Допускает структурный план только по IDs и ревизии порций, прочитанных в том же запуске.
 */
import {
  parsePageDiscoveryCall,
  parsePageDraftContext,
  parsePageStructureContext,
  type PageStructureContextDTO,
  type UpdatePageStructureDraftIntent,
} from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import type { ChatRunContext } from "./ChatRunContext.types";

/** Ответ модели и raw intent не могут внести отсутствующий в журнале snapshot. */
export const matchesPageStructureContext = (
  stored: unknown,
  intent: UpdatePageStructureDraftIntent,
): boolean => {
  if (!stored || typeof stored !== "object" || Array.isArray(stored))
    return false;
  try {
    const context = stored as ChatRunContext;
    if (context.workflow) return false;
    const candidates: PageStructureContextDTO[] = [];
    const addText = (value: unknown) => {
      const snapshot = parsePageDraftContext(value);
      if (snapshot.knowledge)
        candidates.push({
          page: snapshot.page,
          updatedAt: snapshot.updatedAt,
          fingerprint: snapshot.fingerprint,
          knowledge: snapshot.knowledge,
        });
    };
    if (context.pageDraftContext) addText(context.pageDraftContext);
    if (context.pageDiscoveryEnabled) {
      const calls = context.pageDiscoveryCalls ?? [];
      const reads = context.pageReadContexts ?? [];
      const structures = context.pageStructureReadContexts ?? [];
      if (
        !Array.isArray(calls) ||
        calls.length > 12 ||
        !Array.isArray(reads) ||
        reads.length > 3 ||
        !Array.isArray(structures) ||
        structures.length > 8 ||
        Buffer.byteLength(JSON.stringify([reads, structures]), "utf8") >
          384 * 1024
      )
        return false;
      const completed = (callID: string, name: string, requestHash: string) =>
        calls.some(
          (call) =>
            call?.callID === callID &&
            call.name === name &&
            call.requestHash === requestHash &&
            call.status === "completed",
        );
      for (const read of reads) {
        const expectedHash = hashCanonicalJSON({
          name: "pages_read",
          arguments: { pageID: intent.pageID },
        });
        if (
          read?.requestHash === expectedHash &&
          completed(read.callID, "pages_read", expectedHash)
        )
          addText(read.context);
      }
      for (const read of structures) {
        const call = parsePageDiscoveryCall({
          callID: read.callID,
          name: "pages_structure",
          arguments: read.arguments,
        });
        if (call.name !== "pages_structure") return false;
        const expectedHash = hashCanonicalJSON({
          name: call.name,
          arguments: call.arguments,
        });
        if (
          read.requestHash !== expectedHash ||
          !completed(read.callID, call.name, expectedHash)
        )
          continue;
        const snapshot = parsePageStructureContext(read.context);
        if (
          call.arguments.pageID !== snapshot.page.id ||
          (call.arguments.offset ?? 0) !== snapshot.knowledge.outline.offset ||
          (call.arguments.fingerprint &&
            call.arguments.fingerprint !== snapshot.fingerprint) ||
          (call.arguments.catalogHash &&
            call.arguments.catalogHash !== snapshot.knowledge.catalogHash)
        )
          return false;
        candidates.push(snapshot);
      }
    }
    const matching = candidates.filter(
      (snapshot) =>
        snapshot.page.id === intent.pageID &&
        snapshot.updatedAt === intent.expectedUpdatedAt &&
        snapshot.fingerprint === intent.expectedFingerprint &&
        snapshot.knowledge.catalogHash === intent.expectedCatalogHash,
    );
    if (!matching.length) return false;
    const blocks = matching.flatMap(
      (snapshot) => snapshot.knowledge.outline.blocks,
    );
    const visible = (id: string, contentOnly = false) =>
      blocks.some(
        (block) =>
          block.id === id &&
          block.identity === "stable" &&
          (!contentOnly || block.blockType === "content"),
      );
    if (
      intent.operation.type !== "insert" &&
      !visible(intent.operation.blockID, true)
    )
      return false;
    return (
      intent.operation.type === "remove" ||
      intent.operation.beforeBlockID === null ||
      visible(intent.operation.beforeBlockID)
    );
  } catch {
    return false;
  }
};
