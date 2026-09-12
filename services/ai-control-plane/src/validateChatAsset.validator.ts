/**
 * @file services/ai-control-plane/src/validateChatAsset.validator.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет реальные байты поддерживаемых изображений и текстовых вложений.
 */
import sharp from "sharp";
import { CHAT_ATTACHMENT_LIMITS } from "@realize/ai-contracts";
import type { ChatAssetMetadata } from "@realize/ai-contracts";

/** MIME браузера не подтверждает формат; изображения декодируются с ограничением пикселей. */
export const validateChatAsset = async (
  data: Buffer,
  mimeType: string,
): Promise<ChatAssetMetadata["kind"]> => {
  if (
    !(CHAT_ATTACHMENT_LIMITS.mimeTypes as readonly string[]).includes(
      mimeType,
    ) ||
    !data.length
  )
    throw new Error(
      "Unsupported or empty attachment. Use JPEG, PNG, WebP or UTF-8 text.",
    );
  if (mimeType.startsWith("image/")) {
    if (data.length > CHAT_ATTACHMENT_LIMITS.maxImageBytes)
      throw new Error("Image exceeds 8 MiB.");
    const metadata = await sharp(data, {
      limitInputPixels: 25_000_000,
      failOn: "warning",
    }).metadata();
    if (
      `image/${metadata.format}` !== mimeType ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error("Invalid image or unsupported animated image.");
    await sharp(data, {
      limitInputPixels: 25_000_000,
      failOn: "warning",
    }).stats();
    return "image";
  }
  if (data.length > CHAT_ATTACHMENT_LIMITS.maxTextBytes)
    throw new Error("Text attachment exceeds 256 KiB.");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  if (
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) ||
    /^\s*(?:%PDF-|<svg\b|<\?xml[^>]*>\s*<svg\b)/i.test(text)
  )
    throw new Error("Binary files, PDF and SVG are not supported.");
  return "text";
};
