/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexConnectionFields.component.tsx
 * @version 1.1.0
 * @date 2026-09-09
 * @description Собирает параметры Codex и поля выбранного способа авторизации.
 */

import { UiInput, UiSurface, UiSwitch } from "@realize/ui-kit";
import { KeyRound, Settings2 } from "lucide-react";
import { IntegrationFormSection } from "../IntegrationFormSection.component";
import fieldStyles from "../IntegrationConnectionForm.module.css";
import { CodexAuthModeFields } from "./CodexAuthModeFields.component";
import type { CodexConnectionFieldsProps } from "./CodexConnectionFields.types";
import styles from "./CodexConnectionFields.module.css";
import { CodexAccountAccess } from "./CodexAccountAccess.component";
import { CodexTokenAccess } from "./CodexTokenAccess.component";
import { CodexWorkloadAccess } from "./CodexWorkloadAccess.component";

export const CodexConnectionFields = ({ form }: CodexConnectionFieldsProps) => (
  <div className={fieldStyles.formSections}>
    <IntegrationFormSection
      description="Выберите способ доступа Codex к возможностям OpenAI."
      icon={<Settings2 size={20} />}
      title="Подключение"
    >
      <label className={fieldStyles.field}>
        <span>Название подключения</span>
        <UiInput
          autoComplete="off"
          disabled={form.isDisabled}
          maxLength={80}
          onChange={(event) => form.onDisplayNameChange(event.target.value)}
          placeholder="Основной Codex"
          value={form.draft.displayName}
        />
        <small>Понятное название для этого подключения.</small>
      </label>
      <CodexAuthModeFields
        authMode={form.draft.authMode}
        loginMethod={form.draft.loginMethod}
        groupName={form.groupName}
        isDisabled={form.isBusy}
        onChange={form.onAuthModeChange}
      />
      <UiSurface asChild tone="raised">
        <label className={fieldStyles.toggleField}>
          <span className={fieldStyles.toggleCopy}>
            <strong>Использовать подключение</strong>
            <small>Разрешить использование сохранённого доступа к Codex.</small>
          </span>
          <UiSwitch
            checked={form.draft.enabled}
            disabled={form.isDisabled}
            onChange={(event) => form.onEnabledChange(event.target.checked)}
          />
        </label>
      </UiSurface>
    </IntegrationFormSection>
    <IntegrationFormSection
      description="Настройте выбранный источник доступа к GPT — Codex."
      icon={<KeyRound size={20} />}
      title="Доступ"
    >
      <div className={styles.accessContent}>
        {form.draft.authMode === "chatgpt" ? (
          <CodexAccountAccess form={form} />
        ) : form.draft.authMode === "workloadIdentity" ? (
          <CodexWorkloadAccess form={form} />
        ) : (
          <CodexTokenAccess form={form} />
        )}
      </div>
    </IntegrationFormSection>
  </div>
);
