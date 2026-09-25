/**
 * @file services/ai-control-plane/src/RepositoryCursor.types.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Описывает привязку продолжения чтения к правам, запросу и снимку.
 */
export type RepositoryCursorBinding = {
  principal: string;
  policy: string;
  query: unknown;
  snapshot: string;
};
export type RepositoryPageWindow = {
  nextCursor: string | null;
  truncated: boolean;
  truncationReason: "page_limit" | "response_bytes" | "scan_budget" | null;
};
