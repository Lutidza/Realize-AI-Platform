/**
 * @file .ai/tools/git-delivery/src/sync/openGitSyncResources.adapter.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Подключает для fetch/pull общий primary resolver и назначенные SSH-профили без выдачи секретов модели.
 */

import { GitRepositoryConnectionService } from "@realize/payload-ai-control/server/integration-runtime";
import { openGitIntegrationResources } from "../integrations/openGitIntegrationResources.adapter.ts";
import { loadGitContext } from "../loadGitContext.adapter.ts";
import { createGitNetworkSession } from "../network/createGitNetworkSession.adapter.ts";
import { PolicyError } from "@realize/git-runtime";
import type { GitSyncResources } from "./GitSync.types.ts";

/** Закрытие освобождает тот же Pool, которым пользуется existing push integration. */
export async function openGitSyncResources(
  repositoryRoot: string,
): Promise<GitSyncResources> {
  const resources = await openGitIntegrationResources(repositoryRoot);
  const service = new GitRepositoryConnectionService(
    resources.repository,
    resources.encryptionKey,
  );
  return {
    dependencies: {
      resolveConnection: () => service.resolvePrimaryGitRepository(),
      createNetwork: async (git, connection, target) => {
        let sshProfiles: unknown;
        if (connection.transport === "ssh") {
          if (!resources.sshProfilesPath)
            throw new PolicyError(
              "ssh_profiles_required",
              "Не назначен личный файл SSH-профилей исполнителя.",
            );
          try {
            sshProfiles = await loadGitContext(resources.sshProfilesPath);
          } catch {
            throw new PolicyError(
              "ssh_profile_unavailable",
              "Не удалось прочитать назначенные SSH-профили.",
            );
          }
        }
        return createGitNetworkSession({
          git,
          connection,
          expected: target,
          ...(connection.transport === "ssh" ? { sshProfiles } : {}),
        });
      },
    },
    close: () => resources.close(),
  };
}
