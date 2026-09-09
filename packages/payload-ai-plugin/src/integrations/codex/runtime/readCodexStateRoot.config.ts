/**
 * @file packages/payload-ai-plugin/src/integrations/codex/runtime/readCodexStateRoot.config.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Выбирает отдельный постоянный каталог Codex для данной установки CMS.
 */

import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { CodexConnectionError } from "./CodexConnection.error";

/** Оператор может задать общий абсолютный volume для control plane и execution worker. */
export const readCodexStateRoot = (
  environment: NodeJS.ProcessEnv = process.env,
): string => {
  const root =
    environment.REALIZE_CODEX_STATE_ROOT ||
    join(homedir(), ".local", "share", "realize-ai-cms", "codex");
  if (!isAbsolute(root) || root.includes("\0"))
    throw new CodexConnectionError(
      "REALIZE_CODEX_STATE_ROOT должен содержать абсолютный путь к каталогу.",
    );
  return resolve(root);
};
