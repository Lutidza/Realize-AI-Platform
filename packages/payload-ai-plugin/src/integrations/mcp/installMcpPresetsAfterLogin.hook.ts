/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/installMcpPresetsAfterLogin.hook.ts
 * @version 1.0.0
 * @date 2026-09-24
 * @description Дополняет предустановки после входа реального управляющего интеграциями.
 */
import { randomUUID } from "node:crypto";
import { createLocalReq, type CollectionAfterLoginHook } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../../types";
import { McpManagement } from "./McpManagement.service";
import { McpPresets } from "./McpPresets.service";

/** Учитывает host access policy и не меняет чужие login hooks или возвращаемого пользователя. */
export const installMcpPresetsAfterLogin =
  (options: SanitizedRealizeAIPluginOptions): CollectionAfterLoginHook =>
  async ({ user, req, collection }) => {
    const actor = { ...user, collection: collection.slug };
    const local = await createLocalReq({ req, user: actor }, req.payload);
    if (await options.access.canManageIntegrations({ req: local })) {
      await new McpPresets(
        new McpManagement({ req: local, actor, requestKey: randomUUID() }),
      ).install();
    }
    return user;
  };
