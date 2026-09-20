/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminFavorites.context.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Объявляет общий контекст избранного для оболочки и навигации модулей.
 */

"use client";

import { createContext } from "react";
import type { SystemAdminFavoritesContextValue } from "./systemAdminFavorites.types";

export const SystemAdminFavoritesContext =
  createContext<SystemAdminFavoritesContextValue | null>(null);
