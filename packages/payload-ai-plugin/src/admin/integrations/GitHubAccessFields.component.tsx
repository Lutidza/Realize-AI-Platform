/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubAccessFields.component.tsx
 * @version 1.0.1
 * @date 2026-09-09
 * @description Отображает поле ввода и замены токена доступа к GitHub.
 */

"use client";

import { UiInput } from "@realize/ui-kit";
import { CheckCircle2, KeyRound } from "lucide-react";

import type { GitHubAccessFieldsProps } from "./GitHubConnectionFields.types";
import styles from "./IntegrationConnectionForm.module.css";
import { IntegrationFormSection } from "./IntegrationFormSection.component";

export const GitHubAccessFields = ({
  hasCredential,
  isDisabled,
  onTokenChange,
  token,
}: GitHubAccessFieldsProps) => (
  <IntegrationFormSection
    description="Токен используется для доступа к указанному репозиторию."
    icon={<KeyRound size={20} />}
    title="Доступ"
  >
    <label className={styles.field}>
      <span>Personal access token</span>
      <div className={styles.secretInputWrap}>
        <UiInput
          autoCapitalize="none"
          autoComplete="new-password"
          disabled={isDisabled}
          onChange={(event) => onTokenChange(event.target.value)}
          placeholder={
            hasCredential
              ? "Сохранён · введите только для замены"
              : "github_pat_…"
          }
          spellCheck={false}
          type="password"
          value={token}
        />
        {hasCredential && !token ? (
          <CheckCircle2 aria-label="Токен сохранён" size={18} />
        ) : null}
      </div>
      <small>
        {hasCredential
          ? "Оставьте поле пустым, чтобы сохранить текущий токен. Для замены введите новый."
          : "Укажите personal access token для подключения к GitHub."}
      </small>
    </label>
  </IntegrationFormSection>
);
