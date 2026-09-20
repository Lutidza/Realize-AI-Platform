/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminNavigationGroups.component.tsx
 * @version 1.3.2
 * @date 2026-09-18
 * @description Собирает именованные группы из общих строк навигации без привязки к host.
 * @see documentation/architecture/system-admin-shell.md
 */

import { SystemAdminNavigationLink } from "./SystemAdminNavigationLink.component";
import { SystemAdminNavigationSection } from "./SystemAdminNavigationSection.component";
import { SystemAdminFavorites } from "./SystemAdminFavorites.component";
import type { SystemAdminNavigationGroupsProps } from "./SystemAdminShell.types";
import styles from "./SystemAdminNavigationGroups.module.css";

/** Не создаёт свою навигационную рамку: прокруткой и закрытием владеет общий flyout. */
export function SystemAdminNavigationGroups({
  groups,
  onNavigate,
  onOpenSection,
}: SystemAdminNavigationGroupsProps) {
  return (
    <div className={styles.groups}>
      {groups.map((group, groupIndex) => (
        <SystemAdminNavigationSection
          key={group.id}
          label={group.label}
          hideHeading={groupIndex === 0}
        >
          <ul className={styles.list}>
            {group.items.map((item) =>
              item.favoritesSlot ? (
                <li key={item.id}>
                  <h4 className={styles.favoritesHeading}>
                    <span className={styles.icon} aria-hidden="true">
                      {item.icon}
                    </span>
                    {item.label}
                  </h4>
                  <SystemAdminFavorites
                    onNavigate={onNavigate}
                    onOpenSection={onOpenSection}
                  />
                </li>
              ) : (
                <SystemAdminNavigationLink
                  key={item.id}
                  item={item}
                  onNavigate={onNavigate}
                />
              ),
            )}
          </ul>
        </SystemAdminNavigationSection>
      ))}
    </div>
  );
}
