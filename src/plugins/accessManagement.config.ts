/**
 * @file src/plugins/accessManagement.config.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Связывает переносимый центр доступов с текущим Users admission и доверенным origin платформы.
 * @see documentation/architecture/platform-access.md
 */
import type { AccessManagementOptions } from "@realize/payload-access-management";
import { isPlatformOwner } from "@/access/platformOwner.policy";
import { canUseTaskManager } from "./canUseTaskManager.service";

/** Origin берётся из серверной конфигурации, а не из входящих Host/Forwarded headers. */
export const accessManagementOptions: AccessManagementOptions = {
  userCollection: "users",
  userLabelField: "name",
  canUseAccess: canUseTaskManager,
  canManageOthers: ({ req }) => isPlatformOwner(req),
  publicURL:
    process.env.PAYLOAD_PUBLIC_SITE_URL ||
    process.env.PAYLOAD_PUBLIC_SERVER_URL ||
    process.env.NEXT_PUBLIC_SERVER_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000",
};
