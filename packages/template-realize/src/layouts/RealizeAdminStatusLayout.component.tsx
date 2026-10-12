/**
 * @file packages/template-realize/src/layouts/RealizeAdminStatusLayout.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Представляет host status и разрешённые действия в самостоятельном Realize layout.
 * @see documentation/architecture/ui-kit.md
 */
import type { TemplateAdminStatusProps } from "@realize/template-contracts/react";
import { UiButton, UiTheme } from "@realize/ui-kit";
import { REALIZE_STATUS_TITLES } from "./realizeStatusTitles.constants";
import styles from "./RealizeAdminScreens.module.css";

/** Status не выполняет recovery/auth; host передаёт реальные content и callbacks. */
export function RealizeAdminStatusLayout(props: TemplateAdminStatusProps) {
  const title =
    props.title ?? REALIZE_STATUS_TITLES[props.locale ?? "ru"][props.status];
  return (
    <UiTheme
      mode={props.mode}
      baseline
      className={styles.screen}
      lang={props.locale ?? "ru"}
    >
      <main
        className={styles.card}
        data-template-screen="status"
        data-status={props.status}
      >
        {props.brand && <div className={styles.brand}>{props.brand}</div>}
        <h1>{title}</h1>
        <div className={styles.content}>{props.content}</div>
        {!!props.actions?.length && (
          <div className={styles.actions}>
            {props.actions.map((action) => (
              <UiButton
                key={action.id}
                disabled={action.disabled}
                onClick={action.onSelect}
              >
                {action.icon}
                {action.label}
              </UiButton>
            ))}
          </div>
        )}
      </main>
    </UiTheme>
  );
}
