/**
 * @file src/components/admin/system-shell/systemAdmin.types.ts
 * @version 1.2.0
 * @date 2026-10-11
 * @description Описывает безопасный контекст системного интерфейса после серверной проверки сессии.
 * @see documentation/architecture/system-admin-shell.md
 */

/** Документ пользователя и токены остаются внутри серверного адаптера. */
export type SystemAdminContext = {
  initialTheme: "light" | "dark";
  themeCookieName: string;
  currentActor: { id: string; name: string };
};

/** Параметры сохранения режима определяет host, без зависимости client от Payload. */
export type SystemAdminThemeOptions = Pick<
  SystemAdminContext,
  "initialTheme" | "themeCookieName"
>;
