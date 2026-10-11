/**
 * @file src/components/admin/system-shell/useSystemAdminTheme.hook.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Сохраняет выбранный режим системного экрана в существующую host theme cookie.
 * @see documentation/architecture/system-admin-shell.md
 */
"use client";
import { useCallback, useState } from "react";
import type { SystemAdminThemeOptions } from "./systemAdmin.types";

/** Начальная тема берётся из SSR; cookie записывается только при явном выборе пользователя. */
export function useSystemAdminTheme({
  initialTheme,
  themeCookieName,
}: SystemAdminThemeOptions) {
  const [theme, setThemeState] = useState(initialTheme);
  const setTheme = useCallback(
    (next: "light" | "dark") => {
      setThemeState(next);
      // Год соответствует сроку выбора темы в установленном Payload ThemeProvider.
      const maxAge = 365 * 24 * 60 * 60;
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${themeCookieName}=${next}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
    },
    [themeCookieName],
  );
  return { theme, setTheme };
}
