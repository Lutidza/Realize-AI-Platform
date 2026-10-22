/**
 * @file .ai/tools/git-delivery/src/manage/assertGitManageLocalObjects.adapter.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Запрещает локальным object-операциям manage неявный lazy fetch из partial clone.
 */
import type { Git } from "@realize/git-runtime";
import { PolicyError } from "@realize/git-runtime";
import type { GitManageOperation } from "./GitManage.types.ts";

/** Читает только имена effective config; сеть и содержимое credential caller не назначаются. */
export async function assertGitManageLocalObjects(
  git: Git,
  operation: GitManageOperation,
): Promise<void> {
  if (
    !["log", "diff", "branch-create", "branch-switch"].includes(operation.kind)
  )
    return;
  const configured = await git.run(
    [
      "config",
      "--null",
      "--name-only",
      "--get-regexp",
      "^(remote\\..*\\.promisor|extensions\\.partialclone)$",
    ],
    { acceptedExitCodes: [0, 1] },
  );
  if (configured)
    throw new PolicyError(
      "manage_partial_clone_unavailable",
      "Локальные log, diff и операции веток требуют репозиторий без partial-clone/promisor конфигурации.",
    );
}
