/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexIntegrationPanel.view.tsx
 * @version 1.0.1
 * @date 2026-09-09
 * @description Собирает настройки Codex, сохранённую сводку и результаты операций.
 */

import { UiNotice } from "@realize/ui-kit";
import { CheckCircle2, CircleAlert, KeyRound } from "lucide-react";
import styles from "../IntegrationSettingsLayout.module.css";
import { CodexConnectionFields } from "./CodexConnectionFields.component";
import { CodexConnectionSummary } from "./CodexConnectionSummary.component";
import { CodexDisconnectAction } from "./CodexDisconnectAction.component";
import type { CodexIntegrationPanelViewProps } from "./CodexIntegrationPanel.types";
import { CodexSettingsActions } from "./CodexSettingsActions.component";

export const CodexIntegrationPanelView = ({
  connection,
  form,
  vaultConfigured,
}: CodexIntegrationPanelViewProps) => (
  <div className={styles.layout}>
    <div className={styles.editor}>
      {!vaultConfigured && form.draft.authMode !== "workloadIdentity" ? (
        <UiNotice
          icon={<KeyRound size={20} />}
          role="alert"
          title="Хранение данных доступа не настроено"
          tone="danger"
        >
          Настройте защищённое хранение на сервере, чтобы сохранять подключение.
        </UiNotice>
      ) : null}
      <CodexConnectionFields form={form} />
      {form.operations.error || form.operations.login.error ? (
        <UiNotice
          icon={<CircleAlert size={20} />}
          role="alert"
          title="Не удалось завершить действие"
          tone="danger"
        >
          {form.operations.login.error || form.operations.error}
        </UiNotice>
      ) : null}
      {form.operations.testResult ? (
        <UiNotice
          icon={
            form.operations.testResult.status === "passed" ? (
              <CheckCircle2 size={20} />
            ) : (
              <CircleAlert size={20} />
            )
          }
          role="status"
          title={
            form.operations.testResult.status === "passed"
              ? "Доступ подтверждён"
              : "Проверка не пройдена"
          }
          tone={
            form.operations.testResult.status === "passed"
              ? "positive"
              : "danger"
          }
        >
          {form.operations.testResult.message}
        </UiNotice>
      ) : null}
      {form.operations.hasSavedNotice ? (
        <UiNotice
          icon={<CheckCircle2 size={20} />}
          role="status"
          title="Подключение сохранено"
          tone="positive"
        >
          Настройки Codex применены.
        </UiNotice>
      ) : null}
      <CodexSettingsActions form={form} />
    </div>
    <CodexConnectionSummary connection={connection} />
    {connection ? <CodexDisconnectAction form={form} /> : null}
  </div>
);
