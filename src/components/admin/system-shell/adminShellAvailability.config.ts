/**
 * @file src/components/admin/system-shell/adminShellAvailability.config.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Задаёт доступность оболочек установки без инициализации Payload или БД.
 * @see documentation/architecture/system-admin-shell.md
 */
import type { AdminShellMode } from "@realize/payload-extension-manager/contracts";

function enabled(value: string | undefined): boolean {
  if (value === undefined || value === "true") return true;
  if (value === "false") return false;
  throw new Error("ADMIN_SHELL_POLICY_INVALID");
}
const native = enabled(process.env.REALIZE_NATIVE_ADMIN_ENABLED);
const template = enabled(process.env.REALIZE_TEMPLATE_ADMIN_ENABLED);
if (!native && !template) throw new Error("ADMIN_SHELL_POLICY_INVALID");
const requested = process.env.REALIZE_DEFAULT_ADMIN_SHELL;
if (
  requested !== undefined &&
  requested !== "native" &&
  requested !== "template"
)
  throw new Error("ADMIN_SHELL_POLICY_INVALID");
const defaultMode: AdminShellMode =
  requested ?? (template ? "template" : "native");
if (!(defaultMode === "native" ? native : template))
  throw new Error("ADMIN_SHELL_POLICY_INVALID");

/** Нельзя выключить обе оболочки; defaults меняют лишь ещё не сохранённый выбор. */
export const adminShellAvailability = {
  enabled: { native, template },
  defaultMode,
  fallbackMode: (native ? "native" : "template") as AdminShellMode,
};

/** Auth остаётся штатным до отдельного переноса; эти paths конфигурируются в Payload. */
export const nativeAdminAuthRoutes = {
  login: "/login",
  logout: "/logout",
  inactivity: "/logout-inactivity",
  unauthorized: "/unauthorized",
  forgot: "/forgot",
  reset: "/reset",
  createFirstUser: "/create-first-user",
} as const;
