/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminFavoritesProvider.component.tsx
 * @version 1.0.0
 * @date 2026-09-18
 * @description Связывает единое состояние preferences с каталогом доступных целей.
 * @see documentation/architecture/system-admin-shell.md
 */

"use client";

import { SystemAdminFavoritesContext } from "./SystemAdminFavorites.context";
import { getSystemAdminFavoriteTargets } from "./systemAdminFavorites.util";
import type { SystemAdminFavoritesProviderProps } from "./systemAdminFavorites.types";

export function SystemAdminFavoritesProvider({
  navigation,
  preferences,
  onToggle,
  children,
}: SystemAdminFavoritesProviderProps) {
  return (
    <SystemAdminFavoritesContext
      value={{
        targets: getSystemAdminFavoriteTargets(navigation),
        selectedIds: preferences.favorites ?? [],
        toggleFavorite: onToggle,
      }}
    >
      {children}
    </SystemAdminFavoritesContext>
  );
}
