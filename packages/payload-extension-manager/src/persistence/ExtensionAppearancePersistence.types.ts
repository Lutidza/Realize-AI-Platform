/**
 * @file packages/payload-extension-manager/src/persistence/ExtensionAppearancePersistence.types.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Определяет storage boundary appearance и actor-bound replay без raw Payload DTO.
 * @see documentation/specifications/extension-management.md
 */

import type { ExtensionAppearanceStore } from "../appearance/ExtensionAppearance.types";
import type {
  LedgerIdentity,
  ExtensionStateStorageSnapshot,
} from "./ExtensionStatePersistence.types";
export type {
  ExtensionStateDocument,
  ExtensionReceiptDocument,
  ExtensionPersistenceLocalApi,
} from "./ExtensionStatePersistence.types";

/** Scope/actor задаёт host; requestId уже получен из проверенного Idempotency-Key. */
export type ExtensionAppearanceReplay = LedgerIdentity;

/** Отсутствующая schema отличается от пустого, но готового хранилища. */
export type ExtensionAppearanceStorageSnapshot =
  ExtensionStateStorageSnapshot<ExtensionAppearanceStore>;

/** Прикладной callback получает проверенный store с одним matching receipt. */
export type ExtensionAppearanceMutation<Result> = (
  store: ExtensionAppearanceStore,
) =>
  | { store: ExtensionAppearanceStore; result: Result }
  | Promise<{ store: ExtensionAppearanceStore; result: Result }>;

export type ExtensionAppearanceStorageErrorCode =
  | "STORAGE_UNAVAILABLE"
  | "INVALID_STORAGE_STATE"
  | "INDEPENDENT_TRANSACTION_REQUIRED"
  | "IMMUTABLE_RECEIPT";
