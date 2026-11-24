/**
 * @file packages/element-registry/src/OwnerRegistry.error.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Выдаёт стабильные безопасные коды и пути ошибок owner registration.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import type { OwnerRegistryErrorCode } from "./OwnerRegistry.types";

/** Path — JSON pointer к разрешённому полю; message не содержит пользовательские tokens или metadata. */
export class OwnerRegistryError extends Error {
  constructor(
    readonly code: OwnerRegistryErrorCode,
    readonly path: string,
  ) {
    super(`Owner registry validation failed: ${code}.`);
    this.name = "OwnerRegistryError";
  }
}
