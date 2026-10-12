/**
 * @file packages/template-realize/src/layouts/admin/SystemAdminNavigationSettings.component.tsx
 * @version 1.1.1
 * @date 2026-10-12
 * @description Настраивает видимость и порядок разрешённых разделов общей админки.
 * @see documentation/architecture/system-admin-shell.md
 */

import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from "lucide-react";
import { UiButton, UiSwitch } from "@realize/ui-kit";
import type { SystemAdminNavigationSettingsProps } from "./SystemAdminNavigationCustomization.types";
import { useNavigationReorder } from "./useNavigationReorder.hook";
import styles from "./SystemAdminNavigationCustomization.module.css";

/** Изменения передаются сразу; способ сохранения настроек определяет host. */
export function SystemAdminNavigationSettings({
  items,
  preferences,
  onChange,
  onReset,
  onDone,
}: SystemAdminNavigationSettingsProps) {
  const {
    listRef,
    draggingId,
    dropTarget,
    dragStatus,
    move,
    startDrag,
    dragOver,
    drop,
    finish,
  } = useNavigationReorder({ items, preferences, onChange });
  return (
    <div className={styles.settings} data-drag-active={Boolean(draggingId)}>
      <p
        className={styles.dragStatus}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {dragStatus}
      </p>
      <p className={styles.hint}>
        Выберите разделы для основной панели. Скрытые разделы остаются в «Ещё».
      </p>
      <ol
        ref={listRef}
        className={styles.list}
        aria-label="Порядок разделов"
        onDragOver={dragOver}
        onDrop={drop}
      >
        {items.map((item, index) => (
          <li
            key={item.id}
            className={styles.row}
            data-navigation-row={item.id}
            data-dragging={draggingId === item.id}
            data-drop-position={
              dropTarget?.id === item.id ? dropTarget.position : undefined
            }
          >
            <UiButton
              variant="ghost"
              size="icon"
              className={styles.dragHandle}
              draggable
              tabIndex={-1}
              aria-label={`Перетащить ${item.label}`}
              title={`Перетащить ${item.label}`}
              onDragStart={(event) => startDrag(event, item.id)}
              onDragEnd={finish}
            >
              <GripVertical size={16} aria-hidden="true" />
            </UiButton>
            <span className={styles.itemIcon} aria-hidden="true">
              {item.icon}
            </span>
            <span className={styles.itemLabel}>{item.label}</span>
            <div className={styles.rowControls}>
              <UiSwitch
                aria-label={`Показывать ${item.label}`}
                checked={!preferences.hidden.includes(item.id)}
                onChange={(event) =>
                  onChange({
                    ...preferences,
                    hidden: event.target.checked
                      ? preferences.hidden.filter((id) => id !== item.id)
                      : [...new Set([...preferences.hidden, item.id])],
                  })
                }
              />
              <div className={styles.moveActions}>
                <UiButton
                  variant="ghost"
                  size="icon"
                  disabled={index === 0}
                  aria-label={`Выше: ${item.label}`}
                  title="Переместить выше"
                  onClick={() => move(item.id, -1)}
                >
                  <ArrowUp size={14} aria-hidden="true" />
                </UiButton>
                <UiButton
                  variant="ghost"
                  size="icon"
                  disabled={index === items.length - 1}
                  aria-label={`Ниже: ${item.label}`}
                  title="Переместить ниже"
                  onClick={() => move(item.id, 1)}
                >
                  <ArrowDown size={14} aria-hidden="true" />
                </UiButton>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className={styles.hint}>Изменения применяются сразу.</p>
      <div className={styles.actions}>
        <UiButton
          variant="ghost"
          size="small"
          className={styles.reset}
          onClick={onReset}
        >
          <RotateCcw size={15} aria-hidden="true" /> Сбросить по умолчанию
        </UiButton>
        <UiButton size="small" onClick={onDone}>
          Готово
        </UiButton>
      </div>
    </div>
  );
}
