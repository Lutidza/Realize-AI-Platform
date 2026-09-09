/**
 * @file packages/payload-ai-plugin/src/admin/integrations/IntegrationsPage.view.tsx
 * @version 1.0.3
 * @date 2026-09-09
 * @description Отображает общую оболочку каталога и страницы настроек интеграции.
 */

"use client";

import { Link } from "@payloadcms/ui";
import { UiButton, UiNotice } from "@realize/ui-kit";
import { ArrowLeft, CircleAlert, RefreshCw, X } from "lucide-react";
import type { IntegrationsPageViewProps } from "./IntegrationsClient.types";
import styles from "./IntegrationsPage.module.css";

export const IntegrationsPageView = ({
  catalogURL,
  children,
  heading,
  isSettings,
  state,
}: IntegrationsPageViewProps) => (
  <div className={styles.page}>
    <header
      className={`${styles.header} ${isSettings ? styles.settingsHeader : ""}`}
    >
      <div className={styles.titleRow}>
        <h1>{heading}</h1>
        {isSettings ? (
          <Link className={styles.backLink} href={catalogURL}>
            <ArrowLeft aria-hidden="true" size={16} />
            Все интеграции
          </Link>
        ) : null}
      </div>
      <p>
        {isSettings
          ? "Настройки подключения, доступа и работы с сервисом."
          : "Подключайте сервисы и управляйте их настройками."}
      </p>
      <UiButton
        disabled={Boolean(state.busyAction)}
        onClick={() => void state.reload()}
        variant={isSettings ? "secondary" : "primary"}
      >
        <RefreshCw
          aria-hidden="true"
          className={state.busyAction === "load" ? styles.spinner : undefined}
          size={16}
        />
        {state.busyAction === "load" ? "Обновление…" : "Обновить"}
      </UiButton>
    </header>
    {state.error ? (
      <UiNotice
        className={styles.errorBanner}
        icon={<CircleAlert size={20} />}
        role="alert"
        tone="danger"
      >
        <div className={styles.errorContent}>
          <span>{state.error}</span>
          <UiButton
            aria-label="Закрыть сообщение об ошибке"
            onClick={state.clearError}
            size="icon"
            variant="ghost"
          >
            <X aria-hidden="true" size={18} />
          </UiButton>
        </div>
      </UiNotice>
    ) : null}
    <div
      aria-busy={state.busyAction === "load"}
      className={isSettings ? styles.settings : undefined}
    >
      {children}
    </div>
  </div>
);
