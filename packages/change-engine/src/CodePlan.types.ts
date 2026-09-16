/**
 * @file packages/change-engine/src/CodePlan.types.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Задаёт внутренний контракт явных изменений файлов из ответа ассистента.
 */

/** Файлы дают точный write scope; описание не заменяет проверку полномочий и approval. */
export type CodePlan = {
  version: "1.0";
  files: Array<{ path: string; change: string }>;
};
