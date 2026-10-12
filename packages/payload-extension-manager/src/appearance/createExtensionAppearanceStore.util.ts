/**
 * @file packages/payload-extension-manager/src/appearance/createExtensionAppearanceStore.util.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Создаёт независимые target snapshots без persistence или активации кода.
 */
import type {
  CreateExtensionAppearanceStoreInput,
  ExtensionAppearanceStore,
} from "./ExtensionAppearance.types";
import { parseExtensionAppearanceStore } from "./parseExtensionAppearanceStore.validator";

/** Host передаёт проверенное начальное Admin назначение; frontend по умолчанию не назначен. */
export function createExtensionAppearanceStore(
  input: CreateExtensionAppearanceStoreInput = {},
): ExtensionAppearanceStore {
  return parseExtensionAppearanceStore({
    schemaVersion: "1.0",
    targets: {
      admin: { revision: 0, current: input.admin ?? null, previous: null },
      frontend: {
        revision: 0,
        current: input.frontend ?? null,
        previous: null,
      },
    },
    plans: [],
    receipts: [],
  });
}
