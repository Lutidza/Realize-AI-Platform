/**
 * @file packages/ui-kit/src/system-admin-shell/useSystemAdminFavorites.hook.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Подключает общий контракт закрепления, сохраняя standalone-использование компонентов.
 */

"use client";

import { useContext } from "react";
import { SystemAdminFavoritesContext } from "./SystemAdminFavorites.context";

export function useSystemAdminFavorites() {
  return useContext(SystemAdminFavoritesContext);
}
