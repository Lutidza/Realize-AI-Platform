/**
 * @file services/ai-control-plane/src/parseStoredChatAsset.validator.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет приватные метаданные перед использованием ID, MIME и срока хранения.
 */
import {
  CHAT_ATTACHMENT_LIMITS,
  normalizeChatAttachmentMime,
} from "@realize/ai-contracts";
import type { ChatAssetMetadata } from "@realize/ai-contracts";

export const parseStoredChatAsset = (
  value: unknown,
  id: string,
): ChatAssetMetadata => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid attachment metadata.");
  const entry = value as Record<string, unknown>;
  if (
    Object.keys(entry).some(
      (key) =>
        ![
          "id",
          "name",
          "mimeType",
          "size",
          "kind",
          "sha256",
          "createdAt",
        ].includes(key),
    ) ||
    entry.id !== id ||
    typeof entry.name !== "string" ||
    !entry.name ||
    entry.name.length > 200 ||
    /[\x00-\x1f/\\]/.test(entry.name) ||
    typeof entry.mimeType !== "string" ||
    normalizeChatAttachmentMime(entry.name) !== entry.mimeType ||
    !["image", "text"].includes(String(entry.kind)) ||
    (entry.kind === "image") !== entry.mimeType.startsWith("image/") ||
    typeof entry.size !== "number" ||
    !Number.isInteger(entry.size) ||
    entry.size < 1 ||
    entry.size >
      (entry.kind === "image"
        ? CHAT_ATTACHMENT_LIMITS.maxImageBytes
        : CHAT_ATTACHMENT_LIMITS.maxTextBytes) ||
    typeof entry.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(entry.sha256) ||
    typeof entry.createdAt !== "string" ||
    !Number.isFinite(Date.parse(entry.createdAt)) ||
    Date.parse(entry.createdAt) > Date.now() + 300_000
  )
    throw new Error("Invalid attachment metadata.");
  return {
    id,
    name: entry.name,
    mimeType: entry.mimeType,
    size: entry.size,
    kind: entry.kind as "image" | "text",
    sha256: entry.sha256,
    createdAt: entry.createdAt,
  };
};
