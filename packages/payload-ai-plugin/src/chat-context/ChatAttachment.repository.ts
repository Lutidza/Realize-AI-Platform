/**
 * @file packages/payload-ai-plugin/src/chat-context/ChatAttachment.repository.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Хранит метаданные приватных вложений и требует владельца при каждом обращении.
 */
import { CHAT_PENDING_ATTACHMENT_TTL_MS } from "@realize/ai-contracts";
import type { ChatAssetMetadata } from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import { CHAT_ATTACHMENTS_SLUG } from "../constants";
import { EndpointError } from "../endpoints/http";
import type {
  ChatAttachmentDocument,
  ChatAttachmentLocalAPI,
} from "./ChatAttachment.types";

export class ChatAttachmentRepository {
  private readonly api: ChatAttachmentLocalAPI;
  constructor(private readonly req: PayloadRequest) {
    this.api = req.payload as unknown as ChatAttachmentLocalAPI;
  }
  async create(
    metadata: ChatAssetMetadata,
    userID: number | string,
  ): Promise<ChatAttachmentDocument> {
    return this.api.create({
      collection: CHAT_ATTACHMENTS_SLUG,
      overrideAccess: true,
      req: this.req,
      data: {
        assetID: metadata.id,
        createdBy: userID,
        name: metadata.name,
        mimeType: metadata.mimeType,
        size: metadata.size,
        kind: metadata.kind,
        sha256: metadata.sha256,
        expiresAt: new Date(
          Date.parse(metadata.createdAt) + CHAT_PENDING_ATTACHMENT_TTL_MS,
        ).toISOString(),
      },
    });
  }
  async requireOwned(
    id: string,
    userID: number | string,
    allowExpired = false,
  ): Promise<ChatAttachmentDocument> {
    const result = await this.api.find({
      collection: CHAT_ATTACHMENTS_SLUG,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req: this.req,
      where: {
        and: [
          {
            id: {
              equals:
                this.req.payload.db.defaultIDType === "number"
                  ? Number(id)
                  : id,
            },
          },
          { createdBy: { equals: userID } },
        ],
      },
    });
    const document = result.docs[0];
    if (!document)
      throw new EndpointError("NOT_FOUND", "Вложение не найдено.", 404);
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
  }
  async link(document: ChatAttachmentDocument, runID: string): Promise<void> {
    if (document.runID && document.runID !== runID)
      throw new EndpointError(
        "CONFLICT",
        "Вложение уже отправлено в другом сообщении.",
        409,
      );
    await this.api.update({
      collection: CHAT_ATTACHMENTS_SLUG,
      id: document.id,
      overrideAccess: true,
      req: this.req,
      data: { runID },
    });
  }
  async remove(document: ChatAttachmentDocument): Promise<void> {
    await this.api.delete({
      collection: CHAT_ATTACHMENTS_SLUG,
      id: document.id,
      overrideAccess: true,
      req: this.req,
    });
  }
}
