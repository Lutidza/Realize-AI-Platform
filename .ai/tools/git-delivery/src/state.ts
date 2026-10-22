/**
 * @file .ai/tools/git-delivery/src/state.ts
 * @version 1.1.1
 * @date 2026-10-22
 * @description Сохраняет совместимый доступ к журналу commit и блокировке Git.
 */
import type { Context } from "./GitDelivery.types.ts";
import type { Journal } from "./commit/GitCommitJournal.types.ts";
import { GitJournalRepository } from "./GitJournal.repository.ts";
import { validateGitCommitJournal } from "./commit/validateGitCommitJournal.validator.ts";
export type { Journal } from "./commit/GitCommitJournal.types.ts";

export function journalRelativePath(context: Context): string {
  return new GitJournalRepository(context).relativePath;
}

export async function loadJournal(context: Context): Promise<Journal | null> {
  const value = await new GitJournalRepository(context).load();
  return value === null ? null : validateGitCommitJournal(value);
}

export async function saveJournal(
  context: Context,
  journal: Journal,
): Promise<void> {
  await new GitJournalRepository(context).save(journal);
}
