/**
 * @file .ai/tools/git-delivery/src/worker/deliverGitSyncWorkerCommand.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Подключает credential resolver для назначенных fetch/pull и закрывает его ресурсы.
 */

import { runGitSync } from "../sync/runGitSync.service.ts";
import type { GitSyncAction, GitSyncResources } from "../sync/GitSync.types.ts";
import type { GitWorkerContext, GitWorkerResult } from "./GitWorker.types.ts";

/** Привязывает сетевые зависимости к repositoryRoot caller, без передачи credential модели. */
export async function deliverGitSyncWorkerCommand(
  action: GitSyncAction,
  context: GitWorkerContext,
  openResources?: (repositoryRoot: string) => Promise<GitSyncResources>,
): Promise<GitWorkerResult> {
  let resources: GitSyncResources | undefined;
  const getResources = async () => {
    if (!resources) {
      const open =
        openResources ??
        (await import("../sync/openGitSyncResources.adapter.ts"))
          .openGitSyncResources;
      resources = await open(context.repositoryRoot);
    }
    return resources;
  };
  let result: GitWorkerResult | undefined;
  try {
    result = await runGitSync(action, context, {
      resolveConnection: async () =>
        (await getResources()).dependencies.resolveConnection(),
      createNetwork: async (git, connection, target) =>
        (await getResources()).dependencies.createNetwork(
          git,
          connection,
          target,
        ),
    });
  } finally {
    try {
      await resources?.close();
    } catch {
      // Реальная синхронизация сохраняется в result даже при ошибке закрытия БД.
      if (result) {
        result.status = "failed";
        result.errorCode = "connection_cleanup_failed";
      }
    }
  }
  return result;
}
