/**
 * @file packages/payload-ai-plugin/src/endpoints/aiConfigPointerMapper.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проецирует append-only pointer и проверяет bounded mutation replay snapshot.
 * @docref Realize AI Commerce v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import type { ActiveAIConfigPointer } from "@realize/ai-contracts";

import {
  requireStoredKeys,
  storedActorID,
  storedHash,
  storedInteger,
  storedObject,
  storedStableID,
  storedTimestamp,
} from "./aiConfigMapperSupport";
import type { AIDocument } from "./repository";

const pointerFrom = (
  document: Record<string, unknown>,
): ActiveAIConfigPointer => ({
  activatedAt: storedTimestamp(document.activatedAt, "pointer activatedAt"),
  activatedBy: storedActorID(document.activatedBy, "pointer activatedBy"),
  manifestHash: storedHash(document.manifestHash, "pointer manifest hash"),
  releaseID: storedStableID(document.releaseID, "pointer release id"),
  version: storedInteger(document.version, "pointer version"),
});

/** Returns null until a separate activate/rollback command creates a pointer. */
export const toActiveAIConfigPointerDTO = (
  document: AIDocument | undefined,
): ActiveAIConfigPointer | null => {
  if (!document) return null;
  return pointerFrom(document);
};

/** Replay содержит только публичные поля указателя и не раскрывает внутренний документ. */
export const parseActiveAIConfigPointerDTO = (
  value: unknown,
): ActiveAIConfigPointer => {
  const input = storedObject(value, "pointer response snapshot");
  const keys = [
    "activatedAt",
    "activatedBy",
    "manifestHash",
    "releaseID",
    "version",
  ];
  requireStoredKeys(input, keys, keys, "pointer response snapshot");
  return pointerFrom(input);
};
