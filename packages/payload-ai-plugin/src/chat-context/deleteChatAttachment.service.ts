/**
 * @file packages/payload-ai-plugin/src/chat-context/deleteChatAttachment.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Удаляет только неотправленное вложение владельца с проверкой CP claim.
 */
import type { PayloadRequest } from "payload";
import { EndpointError } from "../endpoints/http";
import type { ControlPlaneClient } from "../runtime/controlPlaneClient";
import { ChatAttachmentRepository } from "./ChatAttachment.repository";
import { resolveOwnedChatAttachment } from "./resolveOwnedChatAttachment.service";

export const deleteChatAttachment = async (
  req: PayloadRequest,
  client: ControlPlaneClient,
  id: string,
  userID: number | string,
): Promise<void> => {
  const document = await resolveOwnedChatAttachment(
    req,
    client,
    id,
    userID,
    true,
  );
  if (document.runID)
    throw new EndpointError(
      "CONFLICT",
      "Отправленное вложение сохраняется в истории.",
      409,
    );
  try {
    await client.deleteChatAsset(document.assetID);
  } catch {
    throw new EndpointError(
      "CONFLICT",
      "Вложение уже отправлено или хранилище недоступно.",
      409,
    );
  }
  await new ChatAttachmentRepository(req).remove(document);
};
