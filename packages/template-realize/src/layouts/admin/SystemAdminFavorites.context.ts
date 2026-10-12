/**
 * @file packages/template-realize/src/layouts/admin/SystemAdminFavorites.context.ts
 * @version 1.0.1
 * @date 2026-10-12
 * @description Объявляет общий контекст избранного для оболочки и навигации модулей.
 */

"use client";

import { createContext } from "react";
import type { SystemAdminFavoritesContextValue } from "./systemAdminFavorites.types";

export const SystemAdminFavoritesContext =
  createContext<SystemAdminFavoritesContextValue | null>(null);
