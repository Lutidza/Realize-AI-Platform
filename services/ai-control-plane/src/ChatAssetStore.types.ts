/**
 * @file services/ai-control-plane/src/ChatAssetStore.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Описывает приватную загрузку бинарного потока в control plane.
 */
import type { ChatAssetMetadata } from "@realize/ai-contracts";

export type ChatAssetUpload = {
  name: string;
  mimeType: string;
  chunks: AsyncIterable<Uint8Array>;
};

export type ChatAssetContent = { metadata: ChatAssetMetadata; data: Buffer };
export type MaterializedChatContext = {
  images: Array<{ path: string }>;
  instructions: string;
};
