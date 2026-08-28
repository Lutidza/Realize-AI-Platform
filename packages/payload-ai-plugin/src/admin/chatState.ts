/**
 * @file packages/payload-ai-plugin/src/admin/chatState.ts
 * @version 2026-08-18
 * @description Provides immutable browser-state helpers for the Admin chat controller.
 */

import type {
  ChangeRequestDTO,
  ConversationDetailDTO,
  DataOperationDTO,
} from "@realize/ai-contracts";

/** Converts unknown failures to a stable user-facing fallback. */
export const chatErrorMessage = (cause: unknown, fallback: string): string =>
  cause instanceof Error ? cause.message : fallback;

/** Replaces one Change Request projection without mutating conversation state. */
export const upsertChange = (
  current: ConversationDetailDTO,
  change: ChangeRequestDTO,
): ConversationDetailDTO => ({
  ...current,
  changeRequests: [
    ...current.changeRequests.filter((item) => item.id !== change.id),
    change,
  ],
});

/** Replaces one DataOperation projection without mutating conversation state. */
export const upsertDataOperation = (
  current: ConversationDetailDTO,
  operation: DataOperationDTO,
): ConversationDetailDTO => ({
  ...current,
  dataOperations: [
    ...current.dataOperations.filter((item) => item.id !== operation.id),
    operation,
  ],
});
