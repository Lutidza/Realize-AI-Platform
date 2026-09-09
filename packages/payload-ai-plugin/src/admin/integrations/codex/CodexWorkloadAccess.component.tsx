/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexWorkloadAccess.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Показывает готовность сервера к workload identity без раскрытия путей и токенов.
 */

import { UiButton, UiNotice } from "@realize/ui-kit";
import type { CodexConnectionFieldsProps } from "./CodexConnectionFields.types";
import styles from "./CodexConnectionFields.module.css";

export const CodexWorkloadAccess = ({ form }: CodexConnectionFieldsProps) => (
  <>
    <p className={styles.accessCopy}>
      Сервер получает краткоживущий доступ от доверенной инфраструктуры.
      Постоянный токен в CMS не сохраняется.
    </p>
    <UiNotice title="Workload identity · beta">
      Нужны управляемое рабочее пространство ChatGPT, включённая OpenAI
      возможность workload identity и настроенное правило доверия. Серверная
      инфраструктура должна выпускать и обновлять токен OIDC или SPIFFE.
    </UiNotice>
    <UiNotice
      role="status"
      title={
        form.serverAuth.isLoading
          ? "Проверяем настройки сервера"
          : form.serverAuth.environment?.workloadIdentity.configured
            ? "Сервер настроен"
            : "Требуется настройка сервера"
      }
      tone={
        form.serverAuth.environment?.workloadIdentity.configured
          ? "positive"
          : "neutral"
      }
    >
      {form.serverAuth.isLoading
        ? "Проверяем наличие конфигурации и доступность источника идентификации."
        : form.serverAuth.error ||
          form.serverAuth.environment?.workloadIdentity.message ||
          "Настройки ещё не проверены."}
      {form.serverAuth.environment?.workloadIdentity.configured
        ? " Сохраните подключение и проверьте доступ к OpenAI."
        : null}
    </UiNotice>
    <UiButton
      disabled={form.isBusy || form.serverAuth.isLoading}
      onClick={form.serverAuth.reload}
      variant="secondary"
    >
      Проверить настройки сервера
    </UiButton>
  </>
);
