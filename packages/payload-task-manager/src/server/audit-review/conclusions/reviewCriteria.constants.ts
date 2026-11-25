/**
 * @file packages/payload-task-manager/src/server/audit-review/conclusions/reviewCriteria.constants.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Закрепляет четыре предметных критерия аудита формы «Создать статью».
 * @see documentation/specifications/task-management/execution/article-audit-conclusion.md
 */
export const REVIEW_CRITERIA = [
  "responsibilities",
  "create-chain",
  "verification-chain",
  "findings-and-limits",
] as const;
