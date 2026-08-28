/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubConnectionFields.tsx
 * @version 2026-08-27
 * @description Renders controlled GitHub metadata and write-only credential fields.
 */

"use client";

import type { GitHubIntegrationConnectionDTO } from "@realize/ai-contracts";
import { CheckCircle2 } from "lucide-react";

import styles from "./GitHubConnectionForm.module.css";

type GitHubConnectionFieldsProps = {
  busy: boolean;
  connection?: GitHubIntegrationConnectionDTO;
  displayName: string;
  enabled: boolean;
  repositoryURL: string;
  setDisplayName: (value: string) => void;
  setEnabled: (value: boolean) => void;
  setRepositoryURL: (value: string) => void;
  setToken: (value: string) => void;
  token: string;
  vaultConfigured: boolean;
};

/** Keeps form rendering provider-specific while orchestration remains in the panel. */
export const GitHubConnectionFields = ({
  busy,
  connection,
  displayName,
  enabled,
  repositoryURL,
  setDisplayName,
  setEnabled,
  setRepositoryURL,
  setToken,
  token,
  vaultConfigured,
}: GitHubConnectionFieldsProps) => (
  <div className={styles.formGrid}>
    <label className={styles.field}>
      <span>Название подключения</span>
      <input
        autoComplete="off"
        disabled={busy || !vaultConfigured}
        maxLength={80}
        onChange={(event) => setDisplayName(event.target.value)}
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
        disabled={busy || !vaultConfigured}
        inputMode="url"
        onChange={(event) => setRepositoryURL(event.target.value)}
        placeholder="https://github.com/owner/repository"
        spellCheck={false}
        type="url"
        value={repositoryURL}
      />
      <small>Только canonical HTTPS URL GitHub repository.</small>
    </label>

    <label className={styles.field}>
      <span>Personal access token</span>
      <div className={styles.secretInputWrap}>
        <input
          autoCapitalize="none"
          autoComplete="new-password"
          disabled={busy || !vaultConfigured}
          onChange={(event) => setToken(event.target.value)}
          placeholder={
            connection?.hasCredential
              ? "Сохранён · введите только для замены"
              : "github_pat_…"
          }
          spellCheck={false}
          type="password"
          value={token}
        />
        {connection?.hasCredential && !token ? (
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
        checked={enabled}
        disabled={busy || !vaultConfigured}
        onChange={(event) => setEnabled(event.target.checked)}
        type="checkbox"
      />
    </label>
  </div>
);
