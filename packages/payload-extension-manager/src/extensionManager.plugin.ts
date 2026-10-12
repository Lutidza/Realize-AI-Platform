/**
 * @file packages/payload-extension-manager/src/extensionManager.plugin.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Подключает независимый каталог/appearance к Payload, сохраняя host config и права.
 * @see documentation/specifications/extension-management.md
 */
import type { Plugin } from "payload";
import type { ExtensionManagerOptions } from "./ExtensionManagerOptions.types";
import { resolveExtensionManagerOptions } from "./extensionManagerOptions.config";
import { createExtensionManagerCollections } from "./extensionManagerCollections.config";
import { createExtensionManagerEndpoints } from "./server/extensionManagerEndpoints.controller";
import { createExtensionCatalog } from "./catalog/createExtensionCatalog.service";

export type { ExtensionManagerOptions } from "./ExtensionManagerOptions.types";

/** Namespace collision и отсутствие user owner останавливают bootstrap, а не меняют чужую schema. */
export function extensionManagerPlugin(
  pluginOptions: ExtensionManagerOptions,
): Plugin {
  const options = resolveExtensionManagerOptions(pluginOptions);
  createExtensionCatalog({
    entries: options.catalog,
    hostCompatibility: options.hostCompatibility,
  });
  return (config) => {
    const collections = config.collections ?? [];
    if (
      !collections.some(
        (collection) =>
          collection.slug === options.userCollection && collection.auth,
      )
    )
      throw new Error("Отсутствует auth collection менеджера расширений.");
    const owned = createExtensionManagerCollections();
    if (
      owned.some((own) =>
        collections.some((collection) => collection.slug === own.slug),
      )
    )
      throw new Error("Конфликт namespace коллекций менеджера расширений.");
    const endpoints = createExtensionManagerEndpoints(options);
    if (
      endpoints.some((own) =>
        config.endpoints?.some(
          (endpoint) =>
            own.path === endpoint.path && own.method === endpoint.method,
        ),
      )
    )
      throw new Error("Конфликт namespace endpoints менеджера расширений.");
    return {
      ...config,
      collections: [...collections, ...owned],
      endpoints: [...(config.endpoints ?? []), ...endpoints],
    };
  };
}
