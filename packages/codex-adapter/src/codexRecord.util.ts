/**
 * @file packages/codex-adapter/src/codexRecord.util.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет объект перед чтением недоверенной проекции уведомления Codex.
 */

export const codexRecord = (
  value: unknown,
): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
