/**
 * @file packages/payload-ai-plugin/src/chat-context/readChatUpload.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Ограничивает multipart до разбора и принимает ровно один поддержанный файл.
 */
import {
  CHAT_ATTACHMENT_LIMITS,
  normalizeChatAttachmentMime,
} from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import { EndpointError } from "../endpoints/http";

export const readChatUpload = async (req: PayloadRequest): Promise<File> => {
  if (
    !req.headers.get("content-type")?.startsWith("multipart/form-data;") ||
    !req.body
  )
    throw new EndpointError(
      "INVALID_REQUEST",
      "Передайте один файл в multipart/form-data.",
      400,
    );
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > CHAT_ATTACHMENT_LIMITS.maxImageBytes + 64 * 1024) {
        await reader.cancel();
        throw new EndpointError(
          "INVALID_REQUEST",
          "Файл превышает допустимый размер.",
          400,
        );
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const form = await new Response(Buffer.concat(chunks), {
    headers: { "Content-Type": req.headers.get("content-type")! },
  }).formData();
  const file = form.get("file");
  if (
    !(file instanceof File) ||
    Array.from(form.keys()).length !== 1 ||
    !file.size
  )
    throw new EndpointError(
      "INVALID_REQUEST",
      "Выберите один непустой файл.",
      400,
    );
  const mimeType = normalizeChatAttachmentMime(file.name);
  const limit = mimeType.startsWith("image/")
    ? CHAT_ATTACHMENT_LIMITS.maxImageBytes
    : CHAT_ATTACHMENT_LIMITS.maxTextBytes;
  if (file.size > limit)
    throw new EndpointError(
      "INVALID_REQUEST",
      mimeType.startsWith("image/")
        ? "Изображение должно быть не больше 8 МиБ."
        : "Текстовый файл должен быть не больше 256 КиБ.",
      400,
    );
  return new File([file], file.name, { type: mimeType });
};
