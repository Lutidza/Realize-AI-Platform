/**
 * @file src/components/admin/system-shell/systemAdmin.types.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Описывает безопасный контекст системного интерфейса после серверной проверки сессии.
 * @see documentation/architecture/system-admin-shell.md
 */

/** Документ пользователя и токены остаются внутри серверного адаптера. */
export type SystemAdminContext = { initialTheme: "light" | "dark" };
