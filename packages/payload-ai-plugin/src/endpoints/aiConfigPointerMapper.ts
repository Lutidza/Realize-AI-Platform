/**
 * @file packages/payload-ai-plugin/src/endpoints/aiConfigPointerMapper.ts
 * @version 2026-09-01
 * @description Проецирует latest append-only pointer без activation authority.
 * @docref Realize AI Commerce v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import type { ActiveAIConfigPointer } from "@realize/ai-contracts";

import {
  storedActorID,
  storedHash,
  storedInteger,
  storedStableID,
  storedTimestamp,
} from "./aiConfigMapperSupport";
import type { AIDocument } from "./repository";

/** Returns null until a separate activate/rollback command creates a pointer. */
export const toActiveAIConfigPointerDTO = (
  document: AIDocument | undefined,
): ActiveAIConfigPointer | null => {
  if (!document) return null;
  return {
    activatedAt: storedTimestamp(document.activatedAt, "pointer activatedAt"),
    activatedBy: storedActorID(document.activatedBy, "pointer activatedBy"),
    manifestHash: storedHash(document.manifestHash, "pointer manifest hash"),
    releaseID: storedStableID(document.releaseID, "pointer release id"),
    version: storedInteger(document.version, "pointer version"),
  };
};
