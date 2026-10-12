/**
 * @file packages/template-realize/src/layouts/admin/useSystemAdminFavorites.hook.ts
 * @version 1.0.1
 * @date 2026-10-12
 * @description Подключает общий контракт закрепления, сохраняя standalone-использование компонентов.
 */

"use client";

import { useContext } from "react";
import { SystemAdminFavoritesContext } from "./SystemAdminFavorites.context";

export function useSystemAdminFavorites() {
  return useContext(SystemAdminFavoritesContext);
}
