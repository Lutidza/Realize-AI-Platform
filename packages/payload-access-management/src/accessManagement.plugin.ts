/**
 * @file packages/payload-access-management/src/accessManagement.plugin.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Подключает единый credential owner к Payload без глобальной auth strategy Users.
 * @see documentation/architecture/platform-access.md
 */
import type { Plugin } from "payload";
import type { AccessManagementOptions } from "./AccessManagementOptions.types";
import { ACCESS_COLLECTION_SLUGS } from "./accessManagement.constants";
import { createAccessCollections } from "./accessCollections.config";
import { resolveAccessManagementOptions } from "./accessManagementOptions.config";
import { createAccessEndpoints } from "./server/accessEndpoints.controller";
export type { AccessManagementOptions } from "./AccessManagementOptions.types";
/** Host сохраняет Users authentication; bearer permissions действуют только на явно подключённых endpoints. */
export function accessManagementPlugin(input: AccessManagementOptions): Plugin {
  const options = resolveAccessManagementOptions(input);
  return (config) => {
    const collections = config.collections ?? [];
    if (
      !collections.some(
        (collection) => collection.slug === options.userCollection,
      )
    )
      throw new Error("Access user collection is missing.");
    if (
      collections.some((collection) =>
        ACCESS_COLLECTION_SLUGS.some((slug) => slug === collection.slug),
      )
    )
      throw new Error("Access collection collision.");
    const endpoints = createAccessEndpoints(options);
    if (
      endpoints.some((endpoint) =>
        config.endpoints?.some(
          (existing) =>
            existing.path === endpoint.path &&
            existing.method === endpoint.method,
        ),
      )
    )
      throw new Error("Access endpoint collision.");
    return {
      ...config,
      collections: [...collections, ...createAccessCollections()],
      endpoints: [...(config.endpoints ?? []), ...endpoints],
    };
  };
}
