/**
 * @file packages/payload-ai-plugin/src/chat-context/aiChatConfigurationHandler.controller.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Возвращает пользователю чата доступные профили активного выпуска.
 */
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { requireChatUser } from "../endpoints/access";
import { withHandler } from "../endpoints/request";
import { success } from "../endpoints/http";
import { readAIChatConfigurationCatalog } from "./resolveAIChatConfiguration.service";

export const createAIChatConfigurationHandler = (
  options: SanitizedRealizeAIPluginOptions,
) =>
  withHandler(async (req, correlationID) => {
    await requireChatUser(req, options);
    return success(await readAIChatConfigurationCatalog(req), correlationID);
  });
