/**
 * @file .ai/tools/git-delivery/src/worker/verification/parseGitVerificationWorkerContext.validator.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Проверяет разрешение commit/push до загрузки receipts, не подтверждая результаты проверок.
 */
import { PolicyError } from "@realize/git-runtime";
import { parseContext } from "../../contracts.ts";
import { parseGitPushContext } from "../../push/parseGitPushContext.validator.ts";
import type { GitWorkerAction } from "../GitWorker.types.ts";
import type { GitVerificationWorkerContext } from "./GitWorkerVerification.types.ts";

/** Только explicit plan route может опустить results; пустой список не означает успешную проверку. */
export function parseGitVerificationWorkerContext(
  action: GitWorkerAction,
  input: unknown,
): GitVerificationWorkerContext {
  let source = input;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const record = source as Record<string, unknown>;
    const verification = record.verification;
    if (
      verification &&
      typeof verification === "object" &&
      !Array.isArray(verification) &&
      !Object.hasOwn(verification, "results")
    )
      source = { ...record, verification: { ...verification, results: [] } };
  }
  if (action === "push") return parseGitPushContext(source);
  if (action !== "commit")
    throw new PolicyError(
      "worker_scope_invalid",
      "Verification plan поддерживает только commit и push.",
    );
  const context = parseContext(source);
  if (
    context.authorization.actions.length !== 1 ||
    context.authorization.actions[0] !== "commit"
  )
    throw new PolicyError(
      "worker_scope_invalid",
      "Нужно отдельное разрешение commit от вызывающей среды.",
    );
  if (!context.verification?.requiredChecks.length)
    throw new PolicyError(
      "checks_required",
      "Обязательные проверки назначает вызывающая среда.",
    );
  return context;
}
