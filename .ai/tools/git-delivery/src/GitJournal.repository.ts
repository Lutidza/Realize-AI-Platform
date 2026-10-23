/**
 * @file .ai/tools/git-delivery/src/GitJournal.repository.ts
 * @version 1.1.1
 * @date 2026-10-22
 * @description Назначает фиксированный task namespace Git-журнала общему безопасному JSON owner.
 */
import { PolicyError } from "@realize/git-runtime";
import { PrivateJsonRepository } from "@realize/verification-runtime";
import type { GitJournalContext } from "./GitJournal.types.ts";

/** Политика Git-журнала ограничивает расположение; общий owner выполняет descriptor IO. */
export class GitJournalRepository extends PrivateJsonRepository {
  constructor(
    context: GitJournalContext,
    options: { namespace?: "git-delivery" | "git-verification" } = {},
  ) {
    const namespace = options.namespace ?? "git-delivery";
    if (
      !["git-delivery", "git-verification"].includes(namespace) ||
      ![context.taskId, context.requestId].every(
        (value) =>
          /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value) &&
          !value.includes(".."),
      )
    )
      throw new PolicyError(
        "invalid_journal",
        "Недопустимое пространство журнала.",
      );
    super({
      root: context.repositoryRoot,
      relativePath: `.ai-workspace/tasks/${context.taskId}/logs/${namespace}/${context.requestId}.json`,
    });
  }
}
