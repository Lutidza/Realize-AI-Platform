/**
 * @file packages/payload-extension-manager/src/persistence/extensionAppearanceStateCodec.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Подключает существующие строгие appearance validators к общему state repository.
 * @see documentation/specifications/extension-management.md
 */
import type {
  ExtensionAppearanceReceipt,
  ExtensionAppearanceStore,
} from "../appearance/ExtensionAppearance.types";
import { extensionAppearanceReceiptSchema } from "../appearance/extensionAppearance.schemas";
import { parseExtensionAppearanceStore } from "../appearance/parseExtensionAppearanceStore.validator";
import type { ExtensionStateCodec } from "./ExtensionStatePersistence.types";

/** Shape, hashes и fingerprint прежнего appearance scope остаются без изменений. */
export const extensionAppearanceStateCodec: ExtensionStateCodec<
  ExtensionAppearanceReceipt,
  ExtensionAppearanceStore
> = {
  parseStore: parseExtensionAppearanceStore,
  parseReceipt: (input) => extensionAppearanceReceiptSchema.parse(input),
};
