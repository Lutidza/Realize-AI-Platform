/**
 * @file .ai/tools/git-delivery/src/worker/loadGitWorkerContext.adapter.ts
 * @version 1.3.0
 * @date 2026-10-12
 * @description Привязывает контекст вызывающей среды к рабочей копии установленного Git-воркера.
 */

import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { PolicyError } from "../contracts.ts";
import { loadGitContext } from "../loadGitContext.adapter.ts";
import type {
  GitWorkerAction,
  GitWorkerContext,
  GitWorkerContextLoaderDependencies,
} from "./GitWorker.types.ts";
import { validateGitWorkerContext } from "./validateGitWorkerContext.validator.ts";

export async function loadGitWorkerContext(
  action: GitWorkerAction,
  repositoryRoot: string,
  contextPath?: string,
  dependencies?: GitWorkerContextLoaderDependencies,
): Promise<GitWorkerContext> {
  const root = await realpath(repositoryRoot);
  if (contextPath !== undefined || action !== "inspect") {
    const context = validateGitWorkerContext(
      action,
      await loadGitContext(contextPath),
      action !== "commit",
    );
    if ((await realpath(context.repositoryRoot)) !== root) {
      throw new PolicyError(
        "worker_repository_mismatch",
        "Контекст относится к другой рабочей копии.",
      );
    }
    context.repositoryRoot = root;
    if (
      action === "commit" &&
      !("target" in context) &&
      !("operation" in context) &&
      !context.identity
    ) {
      const resolveAuthor =
        dependencies?.resolveCommitAuthor ??
        (await import("./loadGitCommitAuthor.adapter.ts")).loadGitCommitAuthor;
      context.identity = await resolveAuthor(root);
    }
    return validateGitWorkerContext(action, context);
  }
  const requestId = randomUUID();
  return validateGitWorkerContext(action, {
    version: 1,
    requestId,
    projectId: "realize-ai-cms",
    taskId: `git-inspect-${requestId}`,
    repositoryRoot: root,
    authorization: { actions: ["inspect"], scope: { mode: "all" } },
  });
}
