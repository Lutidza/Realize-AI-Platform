/**
 * @file packages/template-realize/src/layouts/admin/systemAdminNavigationPreferences.util.ts
 * @version 1.2.1
 * @date 2026-10-12
 * @description Согласует пользовательский порядок разделов с текущим доступным каталогом.
 * @see documentation/architecture/system-admin-shell.md
 */

import type { SystemAdminNavigationItem } from "./SystemAdminShell.types";
import type { SystemAdminNavigationPreferences } from "./systemAdminNavigationPreferences.types";
import { getSystemAdminFavoriteTargets } from "./systemAdminFavorites.util";

/**
 * Сохраняет явную видимость известных пунктов, включая hidden=[]. Новые ID
 * добавляет в конец с hiddenByDefault; удалённые и повторные ID исключает.
 */
export function normalizeSystemAdminNavigationPreferences(
  navigation: SystemAdminNavigationItem[],
  preferences?: SystemAdminNavigationPreferences,
): SystemAdminNavigationPreferences {
  const registryIds = [...new Set(navigation.map((item) => item.id))];
  const allowed = new Set(registryIds);
  const known = new Set(preferences?.order ?? []);
  const order = [
    ...new Set((preferences?.order ?? []).filter((id) => allowed.has(id))),
  ];
  order.push(...registryIds.filter((id) => !known.has(id)));
  const hidden = new Set(
    (preferences?.hidden ?? []).filter((id) => allowed.has(id)),
  );
  for (const item of navigation) {
    if (item.hiddenByDefault && (!preferences || !known.has(item.id)))
      hidden.add(item.id);
  }
  const normalized: SystemAdminNavigationPreferences = {
    order,
    hidden: order.filter((id) => hidden.has(id)),
  };
  if (preferences?.favorites !== undefined) {
    const favoriteTargets = new Set(
      getSystemAdminFavoriteTargets(navigation).map((target) => target.id),
    );
    normalized.favorites = [
      ...new Set(preferences.favorites.filter((id) => favoriteTargets.has(id))),
    ];
  }
  if (preferences?.hiddenItems !== undefined)
    normalized.hiddenItems = [...new Set(preferences.hiddenItems)];
  return normalized;
}
