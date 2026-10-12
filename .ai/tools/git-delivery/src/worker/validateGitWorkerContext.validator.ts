/**
 * @file .ai/tools/git-delivery/src/worker/validateGitWorkerContext.validator.ts
 * @version 1.3.0
 * @date 2026-10-12
 * @description Проверяет отдельный контекст Git-воркера без назначения разрешений и результатов проверок.
 */

import { parseContext, PolicyError } from "../contracts.ts";
import { validateGitPushContext } from "../push/validateGitPushContext.validator.ts";
import { validateGitManageContext } from "../manage/validateGitManageContext.validator.ts";
import { validateGitSyncContext } from "../sync/validateGitSyncContext.validator.ts";
import type { GitWorkerAction, GitWorkerContext } from "./GitWorker.types.ts";

/**
 * Проверяет разрешение и evidence; только загрузчик может отложить наличие автора до чтения БД.
 * Перед моделью и в обработчике применяется полная проверка с requireIdentity=true.
 */
export function validateGitWorkerContext(
  action: GitWorkerAction,
  input: unknown,
  requireIdentity = true,
): GitWorkerContext {
  if (action === "push") return validateGitPushContext(input);
  if (action === "manage") return validateGitManageContext(input);
  if (action === "fetch" || action === "pull")
    return validateGitSyncContext(input, action);
  if (action !== "inspect" && action !== "commit") {
    throw new PolicyError(
      "worker_action_unavailable",
      "Воркер поддерживает только inspect и commit.",
    );
  }
  const context = parseContext(input);
  if (
    context.authorization.actions.length !== 1 ||
    context.authorization.actions[0] !== action
  ) {
    throw new PolicyError(
      "worker_scope_invalid",
      "Разрешение должно содержать только выбранное действие.",
    );
  }
  const verification = context.verification;
  if (action === "inspect") {
    if (
      context.identity ||
      verification?.requiredChecks.length ||
      verification?.results.length
    ) {
      throw new PolicyError(
        "worker_scope_invalid",
        "Контекст чтения допускает только область и входные пути снимка.",
      );
    }
    return context;
  }
  if (requireIdentity && !context.identity) {
    throw new PolicyError(
      "identity_required",
      "Авторство commit должно быть определено до запуска воркера.",
    );
  }
  if (!verification?.requiredChecks.length) {
    throw new PolicyError(
      "checks_required",
      "Для commit нужны обязательные проверки из контекста вызывающей среды.",
    );
  }
  let fingerprint: string | undefined;
  for (const id of verification.requiredChecks) {
    const check = verification.results.find((result) => result.id === id);
    if (
      !check ||
      check.status !== "passed" ||
      (fingerprint !== undefined && check.fingerprint !== fingerprint)
    ) {
      throw new PolicyError(
        "checks_stale_or_missing",
        "Обязательные проверки должны быть успешны и относиться к одному снимку.",
      );
    }
    fingerprint = check.fingerprint;
  }
  return context;
}
