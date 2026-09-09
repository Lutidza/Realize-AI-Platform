/**
 * @file .ai/tools/git-delivery/src/commit/resolveGitCommitSnapshot.util.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Выбирает последний принятый снимок одной операции commit.
 */
import type { Journal } from "./GitCommitJournal.types.ts";
import type { Snapshot } from "../GitSnapshot.types.ts";

export function resolveGitCommitSnapshot(journal: Journal): Snapshot {
  return journal.recovery?.snapshot ?? journal.original;
}
