/**
 * @file .ai/tools/git-delivery/src/GitJournal.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Контекст расположения файлового журнала Git-операции.
 */
import type { Context } from "./contracts.ts";

/** Проверенные механизмом запуска идентификаторы и корень рабочего каталога. */
export type GitJournalContext = Pick<
  Context,
  "repositoryRoot" | "taskId" | "requestId"
>;
