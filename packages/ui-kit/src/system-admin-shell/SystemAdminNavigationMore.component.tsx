/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminNavigationMore.component.tsx
 * @version 1.0.1
 * @date 2026-09-18
 * @description Показывает скрытые разделы сеткой и открывает настройку глобальной навигации.
 * @see documentation/architecture/system-admin-shell.md
 */

import { Settings2 } from "lucide-react";
import { UiButton } from "../button/UiButton.component";
import type { SystemAdminNavigationMoreProps } from "./SystemAdminNavigationCustomization.types";
import styles from "./SystemAdminNavigationCustomization.module.css";

/** Содержимое панели «Ещё» не владеет маршрутизацией или самостоятельным диалогом. */
export function SystemAdminNavigationMore({
  items,
  activeNavigationId,
  onSelect,
  onCustomize,
}: SystemAdminNavigationMoreProps) {
  return (
    <div className={styles.more}>
      {items.length ? (
        <div className={styles.grid} role="group" aria-label="Скрытые разделы">
          {items.map((item) => (
            <UiButton
              key={item.id}
              variant="ghost"
              className={styles.tile}
              aria-label={item.label}
              aria-current={item.id === activeNavigationId ? "page" : undefined}
              onClick={() => onSelect(item.id)}
            >
              <span className={styles.tileIcon} aria-hidden="true">
                {item.icon}
              </span>
              <span className={styles.tileLabel}>{item.label}</span>
            </UiButton>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>
          Все разделы уже показаны на панели. Скрыть лишние можно в настройках
          навигации.
        </p>
      )}
      <UiButton
        variant="secondary"
        size="small"
        className={styles.customize}
        onClick={onCustomize}
      >
        <Settings2 size={17} aria-hidden="true" /> Настроить навигацию
      </UiButton>
    </div>
  );
}
