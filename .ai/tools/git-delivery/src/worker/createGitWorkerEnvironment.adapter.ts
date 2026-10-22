/**
 * @file .ai/tools/git-delivery/src/worker/createGitWorkerEnvironment.adapter.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Формирует окружение явно выбранного development-профиля Git-воркера.
 * @see documentation/architecture/decisions/ADR-0016-development-git-delivery-handler.md
 */
import { PolicyError } from "@realize/git-runtime";

import { isAbsolute } from "node:path";
import { createCodexEnvironment } from "@realize/codex-adapter/environment";

/** Профиль назначает вызывающая среда; HOME, CODEX_HOME и API-ключи его не заменяют. */
export function createGitWorkerEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const profileHome = source.REALIZE_GIT_CODEX_HOME;
  if (!profileHome || !isAbsolute(profileHome) || profileHome.includes("\0")) {
    throw new PolicyError(
      "worker_profile_invalid",
      "Назначьте REALIZE_GIT_CODEX_HOME: абсолютный каталог авторизованного development-профиля Codex CLI.",
    );
  }
  return { ...createCodexEnvironment(source), CODEX_HOME: profileHome };
}
