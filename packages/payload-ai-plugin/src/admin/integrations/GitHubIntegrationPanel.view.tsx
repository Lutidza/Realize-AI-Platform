/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubIntegrationPanel.view.tsx
 * @version 1.1.3
 * @date 2026-09-09
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Собирает разделы настроек GitHub, сводку подключения и результаты операций.
 */

"use client";

import { UiNotice } from "@realize/ui-kit";
import { CheckCircle2, CircleAlert, KeyRound } from "lucide-react";
import { GitHubDisconnectAction } from "./GitHubDisconnectAction.component";
import { GitHubConnectionFields } from "./GitHubConnectionFields.component";
import { GitHubConnectionSummary } from "./GitHubConnectionSummary.component";
import { GitHubSettingsActions } from "./GitHubSettingsActions.component";
import styles from "./IntegrationSettingsLayout.module.css";
import type { GitHubIntegrationPanelViewProps } from "./GitHubIntegrationPanel.types";

export const GitHubIntegrationPanelView = ({
  busyAction,
  connection,
  form,
  vaultConfigured,
}: GitHubIntegrationPanelViewProps) => (
  <div className={styles.layout}>
    <div className={styles.editor}>
      {!vaultConfigured ? (
        <UiNotice
          icon={<KeyRound size={20} />}
          role="alert"
          title="Хранение токенов не настроено"
          tone="danger"
        >
          Настройте защищённое хранение на сервере, чтобы сохранять подключение.
        </UiNotice>
      ) : null}
      <GitHubConnectionFields {...form.fields} />
      {form.testResult ? (
        <UiNotice
          icon={
            form.testResult.status === "passed" ? (
              <CheckCircle2 size={20} />
            ) : (
              <CircleAlert size={20} />
            )
          }
          role="status"
          title={
            form.testResult.status === "passed"
              ? "Подключение работает"
              : "Проверка не пройдена"
          }
          tone={form.testResult.status === "passed" ? "positive" : "danger"}
        >
          {form.testResult.message}
        </UiNotice>
      ) : null}
      {form.hasSavedNotice ? (
        <UiNotice
          icon={<CheckCircle2 size={20} />}
          role="status"
          title="Настройки сохранены"
          tone="positive"
        >
          Изменения подключения применены.
        </UiNotice>
      ) : null}
      <GitHubSettingsActions busyAction={busyAction} form={form} />
    </div>
    <GitHubConnectionSummary connection={connection} />
    {connection ? (
      <GitHubDisconnectAction
        busyAction={busyAction}
        isBusy={form.isBusy}
        onDisconnect={form.disconnect}
      />
    ) : null}
  </div>
);
