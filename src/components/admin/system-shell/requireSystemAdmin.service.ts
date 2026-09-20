/**
 * @file src/components/admin/system-shell/requireSystemAdmin.service.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Проверяет сессию Payload и роль администратора перед выдачей безопасного UI-контекста.
 * @see documentation/architecture/system-admin-shell.md
 */

import "server-only";

import configPromise from "@payload-config";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import { formatAdminURL } from "payload/shared";

import { checkRole } from "@/access/utilities";
import type { SystemAdminContext } from "./systemAdmin.types";

/** Каждый защищённый page вызывает проверку заново; успешная тема не служит правом доступа. */
export async function requireSystemAdmin(
  returnTo: string,
): Promise<SystemAdminContext> {
  const payload = await getPayload({ config: configPromise });
  const { user } = await payload.auth({ headers: await headers() });
  const adminRoute = payload.config.routes.admin;
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
  const theme = cookieStore.get(`${payload.config.cookiePrefix}-theme`)?.value;
  return { initialTheme: theme === "light" ? "light" : "dark" };
}
