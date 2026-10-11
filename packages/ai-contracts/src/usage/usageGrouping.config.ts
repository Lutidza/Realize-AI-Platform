/**
 * @file packages/ai-contracts/src/usage/usageGrouping.config.ts
 * @version 1.0.0
 * @date 2026-10-06
 * @description Разделяет отсутствующие значения групп и реальные идентификаторы ledger.
 */
/** Префикс @ запрещён в ledger ID: специальные группы не совпадают с реальными именами. */
export const usageGroupKeys = {
  unassigned: "@unassigned",
  noModel: "@no-model",
} as const;
