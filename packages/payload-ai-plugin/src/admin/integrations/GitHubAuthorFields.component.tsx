/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubAuthorFields.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Отображает поля автора коммитов и связанную ошибку проверки формы.
 */

"use client";

import { UiInput, UiNotice } from "@realize/ui-kit";
import { CircleAlert, UserRound } from "lucide-react";

import type { GitHubAuthorFieldsProps } from "./GitHubConnectionFields.types";
import styles from "./GitHubConnectionForm.module.css";
import { IntegrationFormSection } from "./IntegrationFormSection.component";

export const GitHubAuthorFields = ({
  commitAuthorEmail,
  commitAuthorError,
  commitAuthorErrorID,
  commitAuthorName,
  isDisabled,
  onCommitAuthorEmailChange,
  onCommitAuthorNameChange,
}: GitHubAuthorFieldsProps) => (
  <IntegrationFormSection
    description="Имя и email, которые будут указаны в создаваемых коммитах."
    icon={<UserRound size={20} />}
    title="Автор коммитов"
  >
    <div className={styles.formGrid}>
      <label className={styles.field}>
        <span>Имя автора коммитов</span>
        <UiInput
          aria-describedby={commitAuthorError ? commitAuthorErrorID : undefined}
          aria-invalid={Boolean(commitAuthorError)}
          autoComplete="off"
          disabled={isDisabled}
          maxLength={160}
          onChange={(event) => onCommitAuthorNameChange(event.target.value)}
          placeholder="Имя автора"
          value={commitAuthorName}
        />
        <small>Заполните вместе с email или оставьте оба поля пустыми.</small>
      </label>

      <label className={styles.field}>
        <span>Email автора коммитов</span>
        <UiInput
          aria-describedby={commitAuthorError ? commitAuthorErrorID : undefined}
          aria-invalid={Boolean(commitAuthorError)}
          autoCapitalize="none"
          autoComplete="off"
          disabled={isDisabled}
          inputMode="email"
          maxLength={254}
          onChange={(event) => onCommitAuthorEmailChange(event.target.value)}
          placeholder="author@example.com"
          spellCheck={false}
          type="email"
          value={commitAuthorEmail}
        />
        <small>Адрес будет виден в истории коммитов репозитория.</small>
      </label>
    </div>
    {commitAuthorError ? (
      <UiNotice
        icon={<CircleAlert size={18} />}
        id={commitAuthorErrorID}
        role="alert"
        title="Проверьте автора коммитов"
        tone="danger"
      >
        {commitAuthorError}
      </UiNotice>
    ) : null}
  </IntegrationFormSection>
);
