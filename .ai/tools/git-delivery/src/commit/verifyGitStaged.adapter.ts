/**
 * @file .ai/tools/git-delivery/src/commit/verifyGitStaged.adapter.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет подготовленный commit и обязательное отсутствие явных секретов.
 */
import type { Git } from "../Git.adapter.ts";
import type { Snapshot } from "../GitSnapshot.types.ts";
import { assertNoGitSecrets } from "./assertNoGitSecrets.validator.ts";
import { verifyGitStagedContent } from "./verifyGitStagedContent.adapter.ts";

export async function verifyStaged(
  git: Git,
  snapshot: Snapshot,
  paths: string[],
): Promise<void> {
  await verifyGitStagedContent(git, snapshot, paths, assertNoGitSecrets);
}
