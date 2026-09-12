/**
 * @file packages/payload-ai-plugin/src/chat-context/uploadChatAttachment.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Сохраняет приватное вложение и компенсирует бинарную загрузку при отказе БД.
 */
import type { ChatAttachmentDto } from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import { EndpointError } from "../endpoints/http";
import { ControlPlaneUnavailableError } from "../runtime/controlPlaneClient";
import type { ControlPlaneClient } from "../runtime/controlPlaneClient";
import { ChatAttachmentRepository } from "./ChatAttachment.repository";
import { toChatAttachmentDto } from "./chatAttachment.mapper";

export const uploadChatAttachment = async (
  req: PayloadRequest,
  client: ControlPlaneClient,
  file: File,
  userID: number | string,
): Promise<ChatAttachmentDto> => {
  let metadata;
  try {
    metadata = await client.uploadChatAsset(file, req.signal);
  } catch (error) {
    const isInvalid =
      error instanceof ControlPlaneUnavailableError && error.status === 400;
    throw new EndpointError(
      isInvalid ? "INVALID_REQUEST" : "AI_RUNTIME_UNAVAILABLE",
      isInvalid
        ? "Не удалось прочитать файл. Поддерживаются JPEG, PNG, WebP и UTF-8 текст."
        : "Хранилище вложений недоступно. Проверьте настройки runtime.",
      isInvalid ? 400 : 503,
    );
  }
  try {
    return toChatAttachmentDto(
      await new ChatAttachmentRepository(req).create(metadata, userID),
    );
  } catch (error) {
    try {
      await client.deleteChatAsset(metadata.id);
    } catch {
      req.payload.logger.error({
        msg: "Не удалось удалить несохранённое вложение; оно будет очищено по TTL.",
      });
    }
    throw error;
  }
};
