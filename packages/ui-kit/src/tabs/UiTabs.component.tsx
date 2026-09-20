/**
 * @file packages/ui-kit/src/tabs/UiTabs.component.tsx
 * @version 1.1.0
 * @date 2026-09-17
 * @description Отображает доступные вкладки и сохраняет состояние скрытых панелей.
 */

"use client";

import type { UiTabsProps } from "./UiTabs.types";
import { useUiTabs } from "./useUiTabs.hook";
import styles from "./UiTabs.module.css";

export const UiTabs = (props: UiTabsProps) => {
  const { id, onKeyDown } = useUiTabs(props);
  return (
    <div className={styles.tabs} data-appearance={props.appearance ?? "pills"}>
      <div aria-label={props.label} className={styles.list} role="tablist">
        {props.items.map((item, index) => (
          <button
            aria-controls={`${id}-panel-${index}`}
            aria-selected={props.value === item.id}
            className={styles.tab}
            disabled={props.disabled}
            id={`${id}-tab-${index}`}
            key={item.id}
            onClick={() => props.onValueChange(item.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            role="tab"
            tabIndex={props.value === item.id ? 0 : -1}
            type="button"
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
      {props.items.map((item, index) => (
        <div
          aria-labelledby={`${id}-tab-${index}`}
          className={styles.panel}
          hidden={props.value !== item.id}
          id={`${id}-panel-${index}`}
          key={item.id}
          role="tabpanel"
          tabIndex={0}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
};
