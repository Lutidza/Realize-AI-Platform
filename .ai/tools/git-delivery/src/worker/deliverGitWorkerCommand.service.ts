/**
 * @file .ai/tools/git-delivery/src/worker/deliverGitWorkerCommand.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Направляет действие воркера существующему локальному обработчику или сетевой операции push.
 */

import { runDelivery } from "../handler.ts";
import { runGitPush } from "../push/runGitPush.service.ts";
import type { GitPushResources } from "../push/GitPush.types.ts";
import type {
  GitWorkerCommand,
  GitWorkerContext,
  GitWorkerResult,
} from "./GitWorker.types.ts";

export async function deliverGitWorkerCommand(
  command: GitWorkerCommand,
  context: GitWorkerContext,
): Promise<GitWorkerResult> {
  if (command.action !== "push") return runDelivery(command, context);
  let resources: GitPushResources | undefined;
  const getResources = async () => {
    if (!resources) {
      const { openGitPushResources } =
        await import("../push/openGitPushResources.adapter.ts");
      resources = await openGitPushResources(context.repositoryRoot);
    }
    return resources;
  };
  const result = await runGitPush(context, {
    resolveConnection: async () =>
      (await getResources()).dependencies.resolveConnection(),
    createNetwork: async (git, connection, target) =>
      (await getResources()).dependencies.createNetwork(
        git,
        connection,
        target,
      ),
  });
  try {
    await resources?.close();
  } catch {
    result.status = "failed";
    result.errorCode = "connection_cleanup_failed";
  }
  return result;
}
