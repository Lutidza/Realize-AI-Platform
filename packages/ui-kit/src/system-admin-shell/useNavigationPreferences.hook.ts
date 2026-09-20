/**
 * @file packages/ui-kit/src/system-admin-shell/useNavigationPreferences.hook.ts
 * @version 1.3.0
 * @date 2026-09-18
 * @description Применяет персональный порядок, видимость и избранное к разрешённому host-каталогу.
 * @see documentation/architecture/system-admin-shell.md
 */

"use client";

import { useState } from "react";
import type { SystemAdminNavigationProps } from "./SystemAdminShell.types";
import type { SystemAdminNavigationPreferences } from "./systemAdminNavigationPreferences.types";
import { normalizeSystemAdminNavigationPreferences } from "./systemAdminNavigationPreferences.util";
import { getSystemAdminFavoriteTargets } from "./systemAdminFavorites.util";

/** Без внешнего владельца сохраняет настройки только на время жизни компонента. */
export function useNavigationPreferences({
  navigation,
  navigationPreferences,
  onNavigationPreferencesChange,
}: Pick<
  SystemAdminNavigationProps,
  "navigation" | "navigationPreferences" | "onNavigationPreferencesChange"
>) {
  const [localPreferences, setLocalPreferences] =
    useState<SystemAdminNavigationPreferences>();
  const preferences = normalizeSystemAdminNavigationPreferences(
    navigation,
    onNavigationPreferencesChange
      ? navigationPreferences
      : (localPreferences ?? navigationPreferences),
  );
  const byId = new Map(navigation.map((item) => [item.id, item]));
  const items = preferences.order.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  const hiddenIds = new Set(preferences.hidden);
  const favoriteTargetIds = new Set(
    getSystemAdminFavoriteTargets(navigation).map((target) => target.id),
  );
  const updatePreferences = (next: SystemAdminNavigationPreferences) => {
    const normalized = normalizeSystemAdminNavigationPreferences(
      navigation,
      next,
    );
    if (onNavigationPreferencesChange)
      onNavigationPreferencesChange(normalized);
    else setLocalPreferences(normalized);
  };
  return {
    preferences,
    items,
    visibleItems: items.filter((item) => !hiddenIds.has(item.id)),
    hiddenItems: items.filter((item) => hiddenIds.has(item.id)),
    updatePreferences,
    // Один снимок управляет rail и «Ещё»: включённый пункт больше не считается скрытым.
    showItem: (id: string) => {
      if (hiddenIds.has(id))
        updatePreferences({
          ...preferences,
          hidden: preferences.hidden.filter((hiddenId) => hiddenId !== id),
        });
    },
    toggleFavorite: (id: string) => {
      if (!favoriteTargetIds.has(id)) return;
      const favorites = preferences.favorites ?? [];
      updatePreferences({
        ...preferences,
        favorites: favorites.includes(id)
          ? favorites.filter((favoriteId) => favoriteId !== id)
          : [...favorites, id],
      });
    },
    // Сброс компоновки меню не удаляет независимо выбранные быстрые ссылки.
    resetPreferences: () => {
      const defaults = normalizeSystemAdminNavigationPreferences(navigation);
      updatePreferences({
        ...defaults,
        ...(preferences.favorites !== undefined
          ? { favorites: preferences.favorites }
          : {}),
        ...(preferences.hiddenItems !== undefined
          ? { hiddenItems: preferences.hiddenItems }
          : {}),
      });
    },
  };
}
