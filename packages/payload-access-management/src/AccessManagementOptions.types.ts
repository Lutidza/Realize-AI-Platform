/**
 * @file packages/payload-access-management/src/AccessManagementOptions.types.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Определяет зависимости центра доступов от Users и admission host.
 * @see documentation/architecture/platform-access.md
 */
import type { CollectionSlug, PayloadRequest } from "payload";
/** Host определяет реального пользователя и текущие полномочия, без выдачи wildcard-доступа. */
export type AccessManagementOptions = {
  userCollection: CollectionSlug;
  canUseAccess: (args: { req: PayloadRequest }) => boolean | Promise<boolean>;
  canManageOthers: (args: {
    req: PayloadRequest;
  }) => boolean | Promise<boolean>;
  publicURL: string;
  userLabelField?: string;
};
export type ResolvedAccessManagementOptions = AccessManagementOptions & {
  userLabelField: string;
};
