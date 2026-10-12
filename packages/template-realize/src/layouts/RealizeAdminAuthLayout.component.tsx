/**
 * @file packages/template-realize/src/layouts/RealizeAdminAuthLayout.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Размещает host форму авторизации в собственной композиции Realize.
 * @see documentation/architecture/ui-kit.md
 */
import type { TemplateAdminAuthProps } from "@realize/template-contracts/react";
import { UiTheme } from "@realize/ui-kit";
import styles from "./RealizeAdminScreens.module.css";

/** Компонент получает form content; сессия, validation и submit принадлежат host. */
export function RealizeAdminAuthLayout(props: TemplateAdminAuthProps) {
  const title =
    props.title ??
    (props.locale === "en" ? "Sign in to Realize" : "Вход в Realize");
  return (
    <UiTheme
      mode={props.mode}
      baseline
      className={styles.screen}
      lang={props.locale ?? "ru"}
    >
      <main className={styles.card} data-template-screen="auth">
        {props.brand && <div className={styles.brand}>{props.brand}</div>}
        <h1>{title}</h1>
        <div className={styles.content}>{props.content}</div>
      </main>
    </UiTheme>
  );
}
