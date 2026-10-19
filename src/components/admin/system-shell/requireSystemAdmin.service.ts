/**
 * @file src/components/admin/system-shell/requireSystemAdmin.service.ts
 * @version 1.5.0
 * @date 2026-10-19
 * @description Проверяет сессию Payload и роль администратора перед выдачей безопасного UI-контекста.
 * @see documentation/architecture/system-admin-shell.md
 */

import "server-only";

import configPromise from "@payload-config";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import { formatAdminURL } from "payload/shared";
import {
  readExtensionRuntimeAssignment,
  readAdminShellRuntime,
} from "@realize/payload-extension-manager/server";

import { checkRole } from "@/access/utilities";
import { extensionManagerOptions } from "@/plugins/extensionManager.config";
import { adminAppearanceConfig } from "./adminAppearance.config";
import { systemAdminReferenceAppearance } from "./systemAdminReferenceAppearance.config";
import {
  SYSTEM_ACCESS_ROUTE,
  SYSTEM_ACCESS_DEVICE_ROUTE,
} from "./systemAdmin.routes";
import type {
  RequireSystemAdminOptions,
  SystemAdminContext,
} from "./systemAdmin.types";

/** Каждый защищённый page вызывает проверку заново; успешная тема не служит правом доступа. */
export async function requireSystemAdmin(
  returnTo: string,
  options: RequireSystemAdminOptions = {},
): Promise<SystemAdminContext> {
  // Next должен определить request-bound render до инициализации подключения к БД.
  const requestHeaders = await headers();
  const payload = await getPayload({ config: configPromise });
  const adminRoute = payload.config.routes.admin;
  // Нельзя превратить bearer инструмента в browser управление credential lifecycle.
  const hasBrowserCookie = Boolean(
    requestHeaders
      .get("cookie")
      ?.split(";")
      .some(
        (cookie) =>
          cookie.trim().startsWith(`${payload.config.cookiePrefix}-token=`) &&
          cookie.trim().length > `${payload.config.cookiePrefix}-token=`.length,
      ),
  );
  const authHeaders = options.cookieOnly
    ? new Headers(requestHeaders)
    : requestHeaders;
  if (options.cookieOnly) authHeaders.set("DisableAutologin", "true");
  const authentication =
    options.cookieOnly &&
    (requestHeaders.has("authorization") || !hasBrowserCookie)
      ? { user: null }
      : await payload.auth({ headers: authHeaders });
  const user =
    authentication.user &&
    (!options.cookieOnly ||
      ("_strategy" in authentication.user &&
        authentication.user._strategy === "local-jwt"))
      ? authentication.user
      : null;
  if (!user) {
    const loginRoute = formatAdminURL({
      adminRoute,
      path: payload.config.admin.routes.login,
    });
    // Адрес возврата задаётся route owner, а не параметрами пользовательского запроса.
    redirect(`${loginRoute}?redirect=${encodeURIComponent(returnTo)}`);
  }
  if (user.collection !== "users" || !checkRole(["admin"], user)) {
    redirect(
      formatAdminURL({
        adminRoute,
        path: payload.config.admin.routes.unauthorized,
      }),
    );
  }
  const cookieStore = await cookies();
  const themeCookieName = `${payload.config.cookiePrefix}-theme`;
  const theme = cookieStore.get(themeCookieName)?.value;
  const reference = options.appearance === "reference";
  const shell = reference
    ? null
    : await readAdminShellRuntime(payload, extensionManagerOptions);
  if (shell && !shell.effectiveMode) throw new Error("ADMIN_SHELL_UNAVAILABLE");
  if (returnTo === "/system" && shell?.effectiveMode === "native")
    redirect(shell.policy.nativeRoute);
  // Management остаётся доступным для выбора варианта; рабочие template pages имеют policy guard.
  if (
    shell &&
    !shell.policy.enabled.template &&
    !returnTo.startsWith("/system/appearance") &&
    returnTo !== SYSTEM_ACCESS_ROUTE &&
    returnTo !== SYSTEM_ACCESS_DEVICE_ROUTE
  )
    redirect(shell.policy.nativeRoute);
  const effective = reference
    ? null
    : await readExtensionRuntimeAssignment(
        payload,
        extensionManagerOptions,
        "admin",
      );
  const source = reference
    ? systemAdminReferenceAppearance
    : adminAppearanceConfig;
  const assignment = effective?.assignment;
  if (assignment && assignment.selection.target !== "admin")
    throw new Error("ADMIN_ASSIGNMENT_REQUIRED");
  const selection = assignment
    ? { ...assignment.selection, target: "admin" as const }
    : source.selection;
  return {
    ...(shell?.effectiveMode
      ? {
          adminShell: {
            mode: shell.effectiveMode,
            nativeEnabled: shell.policy.enabled.native,
            requiresRecovery: shell.requiresRecovery,
          },
        }
      : {}),
    initialTheme:
      theme === "light" || theme === "dark"
        ? theme
        : reference
          ? "dark"
          : selection.mode,
    themeCookieName,
    currentActor: {
      id: String(user.id),
      name:
        typeof user.name === "string" && user.name.trim()
          ? user.name
          : "Администратор",
    },
    appearance: {
      selection,
      settings: assignment?.settings ?? source.settings,
      revision: effective?.revision ?? 0,
      persisted: effective?.persisted ?? false,
      storageReady: effective?.storageReady ?? false,
      requiresRecovery: effective?.requiresRecovery ?? false,
    },
  };
}
