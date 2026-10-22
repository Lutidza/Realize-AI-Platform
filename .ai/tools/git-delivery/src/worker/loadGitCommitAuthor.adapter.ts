/**
 * @file .ai/tools/git-delivery/src/worker/loadGitCommitAuthor.adapter.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Получает настроенного автора коммитов из БД и закрывает подключение до запуска модели.
 */
import { PolicyError } from "@realize/git-runtime";

import type { GitCommitAuthor } from "@realize/ai-contracts";
import { GitCommitAuthorService } from "@realize/payload-ai-control/server/integration-runtime";

import { openGitIntegrationResources } from "../integrations/openGitIntegrationResources.adapter.ts";

/** Не расшифровывает credential и не определяет имя/email по GitHub token или системному пользователю. */
export async function loadGitCommitAuthor(
  repositoryRoot: string,
): Promise<GitCommitAuthor> {
  const resources = await openGitIntegrationResources(repositoryRoot);
  try {
    const result = await new GitCommitAuthorService(
      resources.repository,
    ).resolvePrimaryGitCommitAuthor();
    if (result.state !== "ready") {
      throw new PolicyError(
        "identity_required",
        "Укажите имя и email автора коммитов в настройках GitHub-интеграции.",
      );
    }
    return result.author;
  } catch (error) {
    if (error instanceof PolicyError) throw error;
    throw new PolicyError(
      "commit_author_unavailable",
      "Не удалось прочитать автора коммитов из БД интеграций.",
    );
  } finally {
    await resources.close();
  }
}
