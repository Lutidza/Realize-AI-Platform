/**
 * @file packages/ui-kit/src/system-admin-shell/systemAdminFavorites.util.ts
 * @version 1.1.0
 * @date 2026-09-18
 * @description Строит каталог избранного из текущих разделов, подпунктов и ссылок custom panels.
 * @see documentation/architecture/system-admin-shell.md
 */

import type {
  SystemAdminNavigationItem,
  SystemAdminNavigationLink,
} from "./SystemAdminShell.types";
import type { SystemAdminFavoriteTarget } from "./systemAdminFavorites.types";

function hasLinkDestination(item: SystemAdminNavigationLink): boolean {
  return !item.disabled && Boolean(item.href || item.onSelect);
}

function hasAvailableLink(item: SystemAdminNavigationLink): boolean {
  return (
    hasLinkDestination(item) || Boolean(item.shortcuts?.some(hasAvailableLink))
  );
}

/** Только ID сохраняются; действия и доступность всегда берутся из разрешённого host-каталога. */
export function getSystemAdminFavoriteTargets(
  navigation: SystemAdminNavigationItem[],
): SystemAdminFavoriteTarget[] {
  const targets = new Map<string, SystemAdminFavoriteTarget>();
  const addLink = (item: SystemAdminNavigationLink) => {
    const id = `link:${item.id}`;
    if (
      !item.favoritesSlot &&
      item.favoriteable !== false &&
      hasLinkDestination(item) &&
      !targets.has(id)
    )
      targets.set(id, { id, item });
    // Быстрые ссылки остаются самостоятельными назначениями даже у служебного родителя.
    item.shortcuts?.forEach(addLink);
  };
  for (const section of navigation) {
    const id = `section:${section.id}`;
    const hasDestination = Boolean(
      section.href ||
      section.onSelect ||
      section.panel ||
      section.groups?.some((group) => group.items.some(hasAvailableLink)),
    );
    if (section.favoriteable === true && hasDestination && !targets.has(id))
      targets.set(id, {
        id,
        sectionId: section.id,
        item: {
          id: section.id,
          label: section.label,
          icon: section.icon,
          description: section.description,
        },
      });
    section.groups?.forEach((group) => group.items.forEach(addLink));
    section.favoriteLinks?.forEach(addLink);
  }
  return [...targets.values()];
}
