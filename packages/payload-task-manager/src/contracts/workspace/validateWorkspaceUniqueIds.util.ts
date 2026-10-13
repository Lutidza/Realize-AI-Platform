/**
 * @file packages/payload-task-manager/src/contracts/workspace/validateWorkspaceUniqueIds.util.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Отклоняет повторяющиеся идентификаторы в ограниченных списках локального досье.
 * @see documentation/specifications/task-management-execution.md
 */
import type { RefinementCtx } from "zod";

export function validateWorkspaceUniqueIds(
  ids: readonly string[],
  context: RefinementCtx,
  field?: string,
): void {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (seen.has(id)) {
      context.addIssue({
        code: "custom",
        path: field ? [index, field] : [index],
        message: "Идентификатор повторяется.",
      });
    }
    seen.add(id);
  });
}
