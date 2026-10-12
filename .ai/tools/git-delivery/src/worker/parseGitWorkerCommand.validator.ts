/**
 * @file .ai/tools/git-delivery/src/worker/parseGitWorkerCommand.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет команду воркера отдельно от полномочий и параметров назначенной Git-операции.
 */

import { parseCommand, PolicyError } from "../contracts.ts";
import { GIT_WORKER_ACTIONS } from "./gitWorkerActions.constants.ts";
import type { GitWorkerAction, GitWorkerCommand } from "./GitWorker.types.ts";

/** Возвращает только действующее имя worker action, без обхода пути к профилю. */
export function isGitWorkerAction(value: unknown): value is GitWorkerAction {
  return GIT_WORKER_ACTIONS.some((action) => action === value);
}

/** Модель назначает только action и разрешённый текст commit; остальные параметры приходят от caller. */
export function parseGitWorkerCommand(input: unknown): GitWorkerCommand {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new PolicyError("invalid_input", "Нужна команда Git-воркера.");
  const source = input as Record<string, unknown>;
  if (Object.keys(source).some((key) => !["action", "message"].includes(key)))
    throw new PolicyError(
      "invalid_input",
      "Команда не назначает параметры или полномочия.",
    );
  if (!isGitWorkerAction(source.action))
    throw new PolicyError(
      "worker_action_unavailable",
      "Действие Git-воркера недоступно.",
    );
  if (["inspect", "commit", "push"].includes(source.action))
    return parseCommand(source) as GitWorkerCommand;
  if (Object.hasOwn(source, "message"))
    throw new PolicyError(
      "invalid_input",
      "Сообщение допустимо только для commit.",
    );
  return { action: source.action };
}
