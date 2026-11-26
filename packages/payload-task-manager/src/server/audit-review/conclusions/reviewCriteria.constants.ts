/**
 * @file packages/payload-task-manager/src/server/audit-review/conclusions/reviewCriteria.constants.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Задаёт допустимые идентификаторы критериев заключения независимого ревьюера.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 */
export const REVIEW_CRITERIA = [
  "responsibilities",
  "create-chain",
  "verification-chain",
  "findings-and-limits",
] as const;
