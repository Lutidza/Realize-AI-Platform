/**
 * @file .ai/tools/git-delivery/src/push/openGitPushResources.adapter.ts
 * @version 1.0.2
 * @date 2026-10-22
 * @description Подключает общий серверный resolver интеграций и назначенный SSH-профиль для push.
 */
import { PolicyError } from "@realize/git-runtime";

import { GitRepositoryConnectionService } from "@realize/payload-ai-control/server/integration-runtime";
import { openGitIntegrationResources } from "../integrations/openGitIntegrationResources.adapter.ts";

import { loadGitContext } from "../loadGitContext.adapter.ts";
import { createGitNetworkSession } from "../network/createGitNetworkSession.adapter.ts";
import type { GitPushResources } from "./GitPush.types.ts";

export async function openGitPushResources(
  repositoryRoot: string,
): Promise<GitPushResources> {
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
          expected: {
            branch: target.branch,
            sourceOid: target.sourceOid,
            remoteOid: target.remoteOid,
          },
          ...(connection.transport === "ssh" ? { sshProfiles } : {}),
        });
      },
    },
    close: () => resources.close(),
  };
}
