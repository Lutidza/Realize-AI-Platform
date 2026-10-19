/**
 * @file packages/payload-access-management/src/accessManagement.constants.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Закрепляет закрытые коллекции и внутреннюю границу доверенного service context.
 * @see documentation/architecture/platform-access.md
 */
export const ACCESS_CREDENTIALS_SLUG = "access-credentials";
export const ACCESS_DEVICES_SLUG = "access-device-requests";
export const ACCESS_LIMITS_SLUG = "access-rate-limits";
export const ACCESS_REFRESH_HISTORY_SLUG = "access-refresh-history";
export const ACCESS_COLLECTION_SLUGS = [
  ACCESS_CREDENTIALS_SLUG,
  ACCESS_DEVICES_SLUG,
  ACCESS_LIMITS_SLUG,
  ACCESS_REFRESH_HISTORY_SLUG,
] as const;
/** Symbol нельзя передать через REST/GraphQL/JSON или случайный Local API context. */
export const ACCESS_STORAGE_CONTEXT = Symbol("realize.access.storage");
