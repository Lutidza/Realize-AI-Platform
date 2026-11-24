/**
 * @file packages/template-realizeai-control-panel/src/layouts/ControlPanelFrame.component.tsx
 * @version 1.1.0
 * @date 2026-11-17
 * @description Реализует общую сетку двух макетов без дублирования областей.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { useId } from "react";
import { UiTheme } from "@realize/ui-kit";
import type { ControlPanelFrameProps } from "./ControlPanelLayout.types";
import styles from "./ControlPanelLayout.module.css";

/** Содержит только структуру: меню, topbar и бизнес-экраны подключаются отдельными компонентами. */
export function ControlPanelFrame({
  layoutId,
  hasTopbar,
  mode,
  brand,
  rail,
  topbar,
  sidebar,
  content,
  footer,
}: ControlPanelFrameProps) {
  const contentId = useId();
  return (
    <UiTheme
      baseline
      mode={mode}
      className={[styles.shell, !hasTopbar ? styles.withoutTopbar : ""]
        .filter(Boolean)
        .join(" ")}
      data-control-panel-layout={layoutId}
    >
      <a className={styles.skipLink} href={`#${contentId}`}>
        К содержимому
      </a>
      <aside
        className={styles.rail}
        data-panel-region="rail"
        aria-label="Основная навигация"
      >
        <div className={styles.brand}>{brand}</div>
        <div className={styles.railBody}>{rail}</div>
      </aside>
      {hasTopbar && (
        <header className={styles.topbar} data-panel-region="topbar">
          {topbar}
        </header>
      )}
      <div className={styles.body}>
        <aside
          className={styles.sidebar}
          data-panel-region="sidebar"
          aria-label="Боковая панель"
        >
          {sidebar}
        </aside>
        <div className={styles.container}>
          <main
            id={contentId}
            className={styles.content}
            data-panel-region="panel-content"
            tabIndex={-1}
          >
            {content}
          </main>
          <footer className={styles.footer} data-panel-region="footer">
            {footer}
          </footer>
        </div>
      </div>
    </UiTheme>
  );
}
