/**
 * @file packages/payload-ai-plugin/src/endpoints/requireDataOperationWriteTool.service.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Сохраняет запрет новых записей при выключенном агенте, оставляя подтверждённое восстановление доступным.
 */
import type { PayloadRequest } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { DataOperationRepository } from "./dataOperationRepository";
import { requireCodexChatTool } from "./requireCodexChatTool.service";

/** Отмена публикации следует политике recovery; actor/Pages ACL и approval всё равно проверяются исполнителем. */
export const requireDataOperationWriteTool = async (
  req: PayloadRequest,
  operationID: string,
  options: SanitizedRealizeAIPluginOptions,
): Promise<void> => {
  const operation = await new DataOperationRepository(
    req.payload,
    req,
  ).getOwnedOperation(operationID, String(req.user!.id));
  if (operation.kind !== "pages.restorePublication.v1")
    await requireCodexChatTool(req, "dataOperations", options);
};
