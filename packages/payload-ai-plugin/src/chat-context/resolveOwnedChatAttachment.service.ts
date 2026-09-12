/**
 * @file packages/payload-ai-plugin/src/chat-context/resolveOwnedChatAttachment.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Восстанавливает привязку после сбоя БД только по совпадающему run владельца.
 */
import type { PayloadRequest } from "payload";
import { AIRepository } from "../endpoints/repository";
import { EndpointError } from "../endpoints/http";
import { ControlPlaneUnavailableError } from "../runtime/controlPlaneClient";
import type { ControlPlaneClient } from "../runtime/controlPlaneClient";
import { ChatAttachmentRepository } from "./ChatAttachment.repository";
import { toChatMessageContext } from "./chatMessageContext.mapper";
import type { ChatAttachmentDocument } from "./ChatAttachment.types";

/** CP claim не даёт права на файл: сначала проверяется Payload owner, затем снимок его run. */
export const resolveOwnedChatAttachment = async (
  req: PayloadRequest,
  client: ControlPlaneClient,
  id: string,
  userID: number | string,
  allowExpired = false,
): Promise<ChatAttachmentDocument> => {
  const repository = new ChatAttachmentRepository(req);
  const document = await repository.requireOwned(id, userID, true);
  if (!document.runID) {
    let metadata;
    try {
      metadata = await client.chatAssetMetadata(document.assetID);
    } catch (error) {
      if (
        allowExpired &&
        Date.parse(document.expiresAt) < Date.now() &&
        error instanceof ControlPlaneUnavailableError &&
        error.status === 400
      )
        return document;
      throw new EndpointError(
        "NOT_FOUND",
        "Вложение недоступно или срок его хранения истёк.",
        404,
      );
    }
    if (metadata.runID) {
      const run = await new AIRepository(req.payload, req).getRun(
        metadata.runID,
        userID,
      );
      if (
        !toChatMessageContext(run.turnContext).attachments.some(
          (file) => file.id === String(document.id),
        )
      )
        throw new EndpointError(
          "CONFLICT",
          "Вложение связано с другим сообщением.",
          409,
        );
      await repository.link(document, metadata.runID);
      document.runID = metadata.runID;
    }
  }
  if (
    !allowExpired &&
    !document.runID &&
    Date.parse(document.expiresAt) < Date.now()
  )
    throw new EndpointError(
      "CONFLICT",
      "Срок хранения вложения истёк. Загрузите файл снова.",
      409,
    );
  return document;
};
