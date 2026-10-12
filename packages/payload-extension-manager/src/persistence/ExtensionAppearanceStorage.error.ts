/**
 * @file packages/payload-extension-manager/src/persistence/ExtensionAppearanceStorage.error.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Представляет безопасный отказ storage без SQL, state JSON и connection details.
 */

import type { ExtensionAppearanceStorageErrorCode } from "./ExtensionAppearancePersistence.types";

/** Host mapper получает стабильный code; driver errors и их causes не публикуются. */
export class ExtensionAppearanceStorageError extends Error {
  readonly status = 503;

  constructor(
    readonly code: ExtensionAppearanceStorageErrorCode = "STORAGE_UNAVAILABLE",
  ) {
    super(
      "Хранилище оформления недоступно. Повторите запрос с прежним Idempotency-Key.",
    );
    this.name = "ExtensionAppearanceStorageError";
  }
}
