/**
 * @file packages/payload-access-management/src/accessManagementOptions.config.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Проверяет host callbacks и фиксированный origin подтверждения инструментов.
 * @see documentation/architecture/platform-access.md
 */
import type {
  AccessManagementOptions,
  ResolvedAccessManagementOptions,
} from "./AccessManagementOptions.types";
export function resolveAccessManagementOptions(
  options: AccessManagementOptions,
): ResolvedAccessManagementOptions {
  const url = new URL(options.publicURL);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error(
      "Access management requires a fixed HTTPS public origin (or loopback HTTP).",
    );
  if (
    !options.userCollection ||
    typeof options.canUseAccess !== "function" ||
    typeof options.canManageOthers !== "function"
  )
    throw new Error("Access management requires user authorization callbacks.");
  const userLabelField = options.userLabelField ?? "name";
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(userLabelField))
    throw new Error("Invalid access user label field.");
  return { ...options, publicURL: url.origin, userLabelField };
}
