/**
 * @file packages/payload-access-management/src/server/accessManagement.server.index.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Открывает endpoint-local аутентификацию и безопасный тип ошибки host интеграции.
 * @see documentation/architecture/platform-access.md
 */
export { authenticateAccessRequest } from "./authenticateAccessRequest.service";
export { AccessManagementError } from "./AccessManagement.error";
export { resolveAccessManagementOptions } from "../accessManagementOptions.config";
export type { AccessManagementOptions } from "../AccessManagementOptions.types";
