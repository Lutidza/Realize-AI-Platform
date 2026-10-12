/**
 * @file .ai/tools/git-delivery/src/worker/deliverGitWorkerCommand.service.ts
 * @version 1.2.0
 * @date 2026-10-13
 * @description Направляет назначенное действие Git-воркера локальному, управляющему или сетевому владельцу.
 */

import { runDelivery } from "../handler.ts";
import { runGitPush } from "../push/runGitPush.service.ts";
import { runGitManage } from "../manage/runGitManage.service.ts";
import { runGitMerge } from "../merge/runGitMerge.service.ts";
import { deliverGitSyncWorkerCommand } from "./deliverGitSyncWorkerCommand.service.ts";
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
  if (command.action === "merge") {
    const { openGitMergeResources } =
      await import("../merge/openGitMergeResources.adapter.ts");
    const resources = await openGitMergeResources(context.repositoryRoot);
    const result = await runGitMerge(context, resources.dependencies);
    try {
      await resources.close();
    } catch {
      result.status = "failed";
      result.errorCode = "connection_cleanup_failed";
    }
    return result;
  }
  if (command.action === "manage") return runGitManage(context);
  if (command.action === "fetch" || command.action === "pull")
    return deliverGitSyncWorkerCommand(command.action, context);
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
