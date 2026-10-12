/**
 * @file .ai/tools/git-delivery/src/worker/runGitWorker.controller.ts
 * @version 1.3.1
 * @date 2026-10-13
 * @description Принимает Git-действие и передаёт его воркеру с контекстом вызывающей среды.
 */

import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PolicyError } from "../contracts.ts";
import { deliverGitWorkerCommand } from "./deliverGitWorkerCommand.service.ts";
import { createGitWorkerTransport } from "./createGitWorkerTransport.adapter.ts";
import { loadGitWorkerSettings } from "./loadGitWorkerSettings.adapter.ts";
import { loadGitWorkerContext } from "./loadGitWorkerContext.adapter.ts";
import { runGitWorker } from "./runGitWorker.service.ts";
import {
  isGitWorkerAction,
  parseGitWorkerCommand,
} from "./parseGitWorkerCommand.validator.ts";

async function main(): Promise<void> {
  const [action, message, ...extra] = process.argv.slice(2);
  if (
    !isGitWorkerAction(action) ||
    extra.length ||
    (action !== "commit" && message !== undefined)
  ) {
    throw new PolicyError(
      "worker_action_unavailable",
      "Использование: npm run git:worker -- inspect | commit [message] | push | manage | fetch | pull | merge",
    );
  }
  const command = parseGitWorkerCommand({
    action,
    ...(message !== undefined ? { message } : {}),
  });
  const repositoryRoot = await realpath(
    fileURLToPath(new URL("../../../../../", import.meta.url)),
  );
  const context = await loadGitWorkerContext(
    action,
    repositoryRoot,
    process.env.REALIZE_GIT_CONTEXT_FILE,
  );
  const settings = await loadGitWorkerSettings(repositoryRoot, action);
  const abort = new AbortController();
  const cancel = () => abort.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    const report = await runGitWorker(
      command,
      context,
      settings,
      {
        createTransport: (options) =>
          createGitWorkerTransport(repositoryRoot, options),
        deliver: deliverGitWorkerCommand,
      },
      abort.signal,
    );
    process.stdout.write(JSON.stringify(report) + "\n");
    process.exitCode =
      report.status === "succeeded" ? 0 : report.status === "blocked" ? 2 : 1;
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}

try {
  await main();
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      version: 1,
      status: "blocked",
      errorCode:
        error instanceof PolicyError
          ? error.code
          : "worker_configuration_invalid",
      result: null,
    }) + "\n",
  );
  process.exitCode = 2;
}
