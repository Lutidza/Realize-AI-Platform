/**
 * @file .ai/tools/git-delivery/src/worker/loadGitWorkerContext.adapter.ts
 * @version 1.4.0
 * @date 2026-10-22
 * @description Привязывает контекст вызывающей среды к рабочей копии установленного Git-воркера.
 */
import { PolicyError } from "@realize/git-runtime";

import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";

import { loadGitContext } from "../loadGitContext.adapter.ts";
import type {
  GitWorkerAction,
  GitWorkerContext,
  GitWorkerContextLoaderDependencies,
} from "./GitWorker.types.ts";
import { validateGitWorkerContext } from "./validateGitWorkerContext.validator.ts";
import { parseGitVerificationWorkerContext } from "./verification/parseGitVerificationWorkerContext.validator.ts";

export async function loadGitWorkerContext(
  action: GitWorkerAction,
  repositoryRoot: string,
  contextPath?: string,
  dependencies?: GitWorkerContextLoaderDependencies,
): Promise<GitWorkerContext> {
  const root = await realpath(repositoryRoot);
  if (contextPath !== undefined || action !== "inspect") {
    const input = await loadGitContext(contextPath);
    const prepare =
      action === "commit" || action === "push"
        ? dependencies?.prepareVerification
        : undefined;
    let context = prepare
      ? parseGitVerificationWorkerContext(action, input)
      : validateGitWorkerContext(action, input, action !== "commit");
    if ((await realpath(context.repositoryRoot)) !== root) {
      throw new PolicyError(
        "worker_repository_mismatch",
        "Контекст относится к другой рабочей копии.",
      );
    }
    context.repositoryRoot = root;
    if (prepare) {
      const original = structuredClone(
        parseGitVerificationWorkerContext(action, context),
      );
      const prepared = parseGitVerificationWorkerContext(
        action,
        await prepare(structuredClone(original)),
      );
      if (
        JSON.stringify({ ...prepared, verification: original.verification }) !==
          JSON.stringify(original) ||
        JSON.stringify(prepared.verification!.requiredChecks) !==
          JSON.stringify(original.verification!.requiredChecks) ||
        (!("target" in original) &&
          ("target" in prepared ||
            original.verification!.inputPaths.some(
              (path) => !prepared.verification!.inputPaths.includes(path),
            )))
      )
        throw new PolicyError(
          "verification_scope_changed",
          "Receipt materializer изменил назначенные полномочия или входы проверок.",
        );
      context = prepared;
      // Полная проверка evidence выполняется до обращения за авторством и до модели записи.
      context = validateGitWorkerContext(action, context, action !== "commit");
    }
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
