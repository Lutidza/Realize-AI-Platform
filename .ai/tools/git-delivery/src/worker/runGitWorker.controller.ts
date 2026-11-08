/**
 * @file .ai/tools/git-delivery/src/worker/runGitWorker.controller.ts
 * @version 1.5.1
 * @date 2026-11-08
 * @description Направляет inspect программному адаптеру, остальные Git-действия — модельному воркеру.
 */
import { PolicyError } from "@realize/git-runtime";

import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { deliverGitWorkerCommand } from "./deliverGitWorkerCommand.service.ts";
import { openGitWorkerTransport } from "./openGitWorkerTransport.adapter.ts";
import { loadGitWorkerSettings } from "./loadGitWorkerSettings.adapter.ts";
import { loadGitWorkerContext } from "./loadGitWorkerContext.adapter.ts";
import { runGitWorker } from "./runGitWorker.service.ts";
import { runGitInspect } from "./runGitInspect.service.ts";
import { runVerifiedGitWorker } from "./runVerifiedGitWorker.service.ts";
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
  const abort = new AbortController();
  const cancel = () => abort.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    const dependencies = {
      createTransport: (options) =>
        openGitWorkerTransport(repositoryRoot, options),
      deliver: deliverGitWorkerCommand,
    } satisfies import("./GitWorker.types.ts").GitWorkerDependencies;
    const planPath = process.env.REALIZE_GIT_VERIFICATION_PLAN;
    const report =
      action === "inspect"
        ? await runGitInspect(
            await loadGitWorkerContext(
              action,
              repositoryRoot,
              process.env.REALIZE_GIT_CONTEXT_FILE,
            ),
            dependencies.deliver,
            abort.signal,
          )
        : planPath !== undefined && (action === "commit" || action === "push")
          ? await runVerifiedGitWorker(
              command,
              repositoryRoot,
              process.env.REALIZE_GIT_CONTEXT_FILE,
              planPath,
              dependencies,
              abort.signal,
            )
          : await runGitWorker(
              command,
              await loadGitWorkerContext(
                action,
                repositoryRoot,
                process.env.REALIZE_GIT_CONTEXT_FILE,
              ),
              await loadGitWorkerSettings(repositoryRoot, action),
              dependencies,
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
