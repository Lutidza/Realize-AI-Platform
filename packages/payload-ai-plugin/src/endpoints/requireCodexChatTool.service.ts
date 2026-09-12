/**
 * @file packages/payload-ai-plugin/src/endpoints/requireCodexChatTool.service.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Проверяет дополнительный запрет новых управляемых действий по свежим настройкам чата.
 */

import type { CodexChatSettingsDto } from "@realize/ai-contracts";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import type { PayloadRequest } from "payload";
import { readCodexChatSettings } from "../integrations/codex/readCodexChatSettings.service";
import { EndpointError } from "./http";

/** Вызывается после авторизации и не заменяет approvals; отмена и откат его не используют. */
export const requireCodexChatTool = async (
  req: PayloadRequest,
  tool: keyof CodexChatSettingsDto["tools"],
  options: SanitizedRealizeAIPluginOptions,
): Promise<void> => {
  if (!options.enabled)
    throw new EndpointError(
      "AI_DISABLED",
      options.runtimeStatus?.reason ?? "Административный агент выключен.",
      409,
    );
  if (!(await readCodexChatSettings(req)).tools[tool])
    throw new EndpointError(
      "FORBIDDEN",
      tool === "codeChanges"
        ? "Изменения кода выключены в настройках чата Codex."
        : "Операции с данными выключены в настройках чата Codex.",
      403,
    );
};
