/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubConnectionFields.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Отображает управляемые поля репозитория, автора коммитов и token подключения GitHub.
 */

"use client";

import { CheckCircle2 } from "lucide-react";

import type { GitHubConnectionFieldsProps } from "./GitHubConnectionFields.types";
import styles from "./GitHubConnectionForm.module.css";

export const GitHubConnectionFields = ({
  commitAuthorEmail,
  commitAuthorError,
  commitAuthorErrorID,
  commitAuthorName,
  displayName,
  hasCredential,
  isDisabled,
  isEnabled,
  onCommitAuthorEmailChange,
  onCommitAuthorNameChange,
  onDisplayNameChange,
  onEnabledChange,
  onRepositoryURLChange,
  onTokenChange,
  repositoryURL,
  token,
}: GitHubConnectionFieldsProps) => (
  <div className={styles.formGrid}>
    <label className={styles.field}>
      <span>Название подключения</span>
      <input
        autoComplete="off"
        disabled={isDisabled}
        maxLength={80}
        onChange={(event) => onDisplayNameChange(event.target.value)}
        placeholder="Основной GitHub"
        value={displayName}
      />
      <small>Поможет различать подключения в будущем.</small>
    </label>

    <label className={styles.field}>
      <span>Ссылка на репозиторий</span>
      <input
        autoCapitalize="none"
        autoComplete="url"
        disabled={isDisabled}
        inputMode="url"
        onChange={(event) => onRepositoryURLChange(event.target.value)}
        placeholder="https://github.com/owner/repository"
        spellCheck={false}
        type="url"
        value={repositoryURL}
      />
      <small>Только canonical HTTPS URL GitHub repository.</small>
    </label>

    <label className={styles.field}>
      <span>Имя автора коммитов</span>
      <input
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
      <input
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
      <small>Этот адрес будет указан в авторстве создаваемых коммитов.</small>
    </label>

    <label className={styles.field}>
      <span>Personal access token</span>
      <div className={styles.secretInputWrap}>
        <input
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
          <CheckCircle2 aria-label="Credential сохранён" size={18} />
        ) : null}
      </div>
      <small>
        Нужны repository-scoped contents write и Actions read/write.
      </small>
    </label>

    <label className={styles.toggleField}>
      <span>
        <strong>Использовать подключение</strong>
        <small>Disabled connection не передаётся release worker-у.</small>
      </span>
      <input
        checked={isEnabled}
        disabled={isDisabled}
        onChange={(event) => onEnabledChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  </div>
);
