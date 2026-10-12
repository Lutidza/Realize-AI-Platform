/**
 * @file .ai/tools/git-delivery/src/merge/openGitMergeResources.adapter.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Подключает approved-tree merge к общему GitHub resolver без передачи credential модели.
 */
import { GitHubConnectionService } from "@realize/payload-ai-control/server/integration-runtime";
import { openGitIntegrationResources } from "../integrations/openGitIntegrationResources.adapter.ts";
import { GitMergeGitHubAdapter } from "./GitMergeGitHub.adapter.ts";
import type { GitMergeResources } from "./GitMerge.types.ts";

/** Pool закрывает worker dispatcher; fresh resolver сверяет primary revision перед каждой mutation. */
export async function openGitMergeResources(
  root: string,
): Promise<GitMergeResources> {
  const resources = await openGitIntegrationResources(root);
  const service = new GitHubConnectionService(
    resources.repository,
    resources.encryptionKey,
  );
  return {
    dependencies: {
      resolveConnection: () => service.resolvePrimaryGitHub(),
      createRemote: (connection) =>
        new GitMergeGitHubAdapter(connection.token, connection.repositorySlug),
    },
    close: () => resources.close(),
  };
}
