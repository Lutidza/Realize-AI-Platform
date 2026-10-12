/**
 * @file packages/template-realize/src/layouts/admin/SystemAdminFavorites.component.tsx
 * @version 1.1.1
 * @date 2026-10-12
 * @description Выводит закреплённые пункты с актуальными переходами и доступностью каталога.
 * @see documentation/architecture/system-admin-shell.md
 */

import { SystemAdminNavigationLink } from "./SystemAdminNavigationLink.component";
import { useSystemAdminFavorites } from "./useSystemAdminFavorites.hook";
import type { SystemAdminFavoritesProps } from "./systemAdminFavorites.types";
import styles from "./SystemAdminNavigationGroups.module.css";
import favoriteStyles from "./SystemAdminFavorites.module.css";

export function SystemAdminFavorites({
  onNavigate,
  onOpenSection,
}: SystemAdminFavoritesProps) {
  const favorites = useSystemAdminFavorites();
  const byId = new Map(favorites?.targets.map((target) => [target.id, target]));
  const selected =
    favorites?.selectedIds.flatMap((id) => {
      const target = byId.get(id);
      return target ? [target] : [];
    }) ?? [];
  return (
    <div
      data-favorites-list
      role="region"
      aria-label="Закреплённые пункты"
      tabIndex={-1}
    >
      {selected.length ? (
        <ul className={`${styles.list} ${styles.shortcuts}`}>
          {selected.map((target) => (
            <SystemAdminNavigationLink
              key={target.id}
              favoriteId={target.id}
              item={{
                ...target.item,
                shortcuts: undefined,
                ...(target.sectionId
                  ? {
                      onSelect: onOpenSection
                        ? () => onOpenSection(target.sectionId!)
                        : undefined,
                    }
                  : {}),
              }}
              onNavigate={target.sectionId ? () => undefined : onNavigate}
            />
          ))}
        </ul>
      ) : (
        <p className={favoriteStyles.empty}>
          Откройте меню «…» рядом с пунктом и выберите «Добавить в избранное».
        </p>
      )}
    </div>
  );
}
