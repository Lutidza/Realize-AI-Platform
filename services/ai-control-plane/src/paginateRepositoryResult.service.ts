/**
 * @file services/ai-control-plane/src/paginateRepositoryResult.service.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Выдаёт полные элементы с привязанным к снимку продолжением и wire budget.
 */
import type {
  RepositoryCursorBinding,
  RepositoryPageWindow,
} from "./RepositoryCursor.types";
import type { RepositoryQueryContext } from "./RepositoryQueries.types";
import { RepositoryReadError } from "./RepositoryRead.error";

export function paginateRepositoryResult<T>(
  items: T[],
  context: RepositoryQueryContext,
  query: unknown,
  snapshot: string,
  cursor: string | undefined,
  limit: number,
  incomplete = false,
): { items: T[] } & RepositoryPageWindow {
  const binding: RepositoryCursorBinding = {
    principal: context.principal,
    policy: context.policy.version,
    query,
    snapshot,
  };
  const offset = context.cursors.resolve(cursor, binding);
  if (offset > items.length)
    throw new RepositoryReadError(
      "INVALID_CURSOR",
      "Позиция продолжения недоступна.",
    );
  const selected: T[] = [];
  const budget = (context.responseBytes ?? 131072) - 4096;
  let bytes = 0;
  let reason: RepositoryPageWindow["truncationReason"] = null;
  for (const item of items.slice(offset)) {
    if (selected.length >= limit) {
      reason = "page_limit";
      break;
    }
    const size = Buffer.byteLength(JSON.stringify(item)) + 1;
    if (bytes + size > budget) {
      reason = "response_bytes";
      break;
    }
    bytes += size;
    selected.push(item);
  }
  if (!selected.length && items.length > offset)
    throw new RepositoryReadError(
      "RESULT_LIMIT",
      "Один элемент превышает допустимый размер ответа.",
    );
  if (incomplete) reason = "scan_budget";
  return {
    items: selected,
    truncated: reason !== null,
    truncationReason: reason,
    nextCursor:
      reason && !incomplete
        ? context.cursors.create(binding, offset + selected.length)
        : null,
  };
}
