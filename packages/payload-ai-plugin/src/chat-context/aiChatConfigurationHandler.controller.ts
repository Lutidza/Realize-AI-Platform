/**
 * @file packages/payload-ai-plugin/src/chat-context/aiChatConfigurationHandler.controller.ts
 * @version 1.1.0
 * @date 2026-10-23
 * @description Возвращает пользователю чата доступные профили активного выпуска.
 */
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { requireChatUser } from "../endpoints/access";
import { withHandler } from "../endpoints/request";
import { success } from "../endpoints/http";
import { readAIChatConfigurationCatalog } from "./resolveAIChatConfiguration.service";
import { OWNER_ENGINEERING_PROFILE_KEY } from "@realize/ai-contracts";
import { readOwnerEngineeringTarget } from "./readOwnerEngineeringTarget.service";

export const createAIChatConfigurationHandler = (
  options: SanitizedRealizeAIPluginOptions,
) =>
  withHandler(async (req, correlationID) => {
    await requireChatUser(req, options);
    const catalog = await readAIChatConfigurationCatalog(req, options);
    if (
      catalog.profiles.some(
        (profile) => profile.key === OWNER_ENGINEERING_PROFILE_KEY,
      )
    )
      catalog.ownerEngineering = await readOwnerEngineeringTarget(req, options);
    return success(catalog, correlationID);
  });
