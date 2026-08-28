/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubIntegrationPanel.tsx
 * @version 2026-08-27
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Renders the write-only GitHub connection form and safe test evidence.
 */

"use client";

import type {
  GitHubIntegrationConnectionDTO,
  GitHubIntegrationTestDTO,
  SaveGitHubIntegrationInput,
  TestGitHubIntegrationInput,
} from "@realize/ai-contracts";
import {
  ExternalLink,
  GitFork,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { useState } from "react";

import { GitHubConnectionFields } from "./GitHubConnectionFields";
import formStyles from "./GitHubConnectionForm.module.css";
import styles from "./GitHubIntegrationPanel.module.css";

type GitHubIntegrationPanelProps = {
  busyAction?: "disconnect" | "load" | "save" | "test";
  connection?: GitHubIntegrationConnectionDTO;
  onDisconnect: (revision: number) => Promise<boolean>;
  onSave: (
    input: SaveGitHubIntegrationInput,
  ) => Promise<GitHubIntegrationConnectionDTO | undefined>;
  onTest: (
    input: TestGitHubIntegrationInput,
  ) => Promise<GitHubIntegrationTestDTO | undefined>;
  vaultConfigured: boolean;
};

const testStatusLabel = (
  connection: GitHubIntegrationConnectionDTO | undefined,
): string => {
  if (!connection || connection.lastTestStatus === "never")
    return "Ещё не проверено";
  return connection.lastTestStatus === "passed"
    ? "Проверка пройдена"
    : "Последняя проверка не пройдена";
};

/** Keeps draft token only in component memory and clears it after save. */
export const GitHubIntegrationPanel = ({
  busyAction,
  connection,
  onDisconnect,
  onSave,
  onTest,
  vaultConfigured,
}: GitHubIntegrationPanelProps) => {
  const [displayName, setDisplayName] = useState(
    connection?.displayName || "Основной GitHub",
  );
  const [enabled, setEnabled] = useState(connection?.enabled ?? true);
  const [repositoryURL, setRepositoryURL] = useState(
    connection?.configuration.repositoryURL || "",
  );
  const [token, setToken] = useState("");
  const [testResult, setTestResult] = useState<GitHubIntegrationTestDTO>();
  const [savedNotice, setSavedNotice] = useState(false);
  const busy = Boolean(busyAction);

  const save = async () => {
    setSavedNotice(false);
    setTestResult(undefined);
    const saved = await onSave({
      displayName,
      enabled,
      expectedRevision: connection?.revision || 0,
      repositoryURL,
      ...(token ? { token } : {}),
    });
    if (saved) {
      setToken("");
      setSavedNotice(true);
    }
  };

  const test = async () => {
    setSavedNotice(false);
    const result = await onTest({
      repositoryURL,
      ...(token ? { token } : {}),
    });
    if (result) setTestResult(result);
  };

  const disconnect = async () => {
    if (!connection) return;
    const confirmed = window.confirm(
      "Отключить GitHub и удалить сохранённый credential?",
    );
    if (!confirmed) return;
    if (await onDisconnect(connection.revision)) {
      setRepositoryURL("");
      setToken("");
      setTestResult(undefined);
      setSavedNotice(false);
    }
  };

  const canTest =
    vaultConfigured &&
    Boolean(repositoryURL.trim()) &&
    Boolean(token || connection?.hasCredential);
  const canSave =
    vaultConfigured &&
    Boolean(repositoryURL.trim()) &&
    Boolean(token || connection?.hasCredential);

  return (
    <article className={styles.detailPanel}>
      <header className={styles.integrationHeader}>
        <div className={styles.integrationIdentity}>
          <span className={styles.integrationLogo}>
            <GitFork aria-hidden="true" size={30} />
          </span>
          <div>
            <p className={styles.sectionEyebrow}>
              Development · Source control
            </p>
            <h2>GitHub</h2>
            <p>
              Репозиторий и credential для candidate refs и release workflow.
            </p>
          </div>
        </div>
        <span
          className={`${styles.statusBadge} ${
            connection?.hasCredential
              ? styles.statusBadgeConnected
              : styles.statusBadgeIdle
          }`}
        >
          {connection?.hasCredential ? "Подключено" : "Не настроено"}
        </span>
      </header>

      {!vaultConfigured ? (
        <div className={styles.vaultWarning} role="alert">
          <KeyRound aria-hidden="true" size={19} />
          <div>
            <strong>Secret vault не настроен</strong>
            <span>
              Добавьте server-only `REALIZE_INTEGRATIONS_ENCRYPTION_KEY`, затем
              перезапустите приложение и worker.
            </span>
          </div>
        </div>
      ) : (
        <div className={styles.securityNote}>
          <ShieldCheck aria-hidden="true" size={19} />
          <div>
            <strong>Credential хранится write-only</strong>
            <span>
              После сохранения token нельзя прочитать из Admin API. Можно только
              заменить или удалить его.
            </span>
          </div>
        </div>
      )}

      <GitHubConnectionFields
        busy={busy}
        connection={connection}
        displayName={displayName}
        enabled={enabled}
        repositoryURL={repositoryURL}
        setDisplayName={setDisplayName}
        setEnabled={setEnabled}
        setRepositoryURL={setRepositoryURL}
        setToken={setToken}
        token={token}
        vaultConfigured={vaultConfigured}
      />

      <div className={styles.connectionEvidence}>
        <div>
          <span>Состояние проверки</span>
          <strong>{testStatusLabel(connection)}</strong>
        </div>
        <div>
          <span>Ветка по умолчанию</span>
          <strong>{connection?.configuration.defaultBranch || "—"}</strong>
        </div>
        <div>
          <span>Последнее изменение</span>
          <strong>
            {connection
              ? new Date(connection.updatedAt).toLocaleString("ru-RU")
              : "—"}
          </strong>
        </div>
      </div>

      {testResult ? (
        <div
          className={`${styles.resultNotice} ${
            testResult.status === "passed"
              ? styles.resultNoticePassed
              : styles.resultNoticeFailed
          }`}
          role="status"
        >
          <strong>
            {testResult.status === "passed"
              ? "Подключение работает"
              : "Проверка не пройдена"}
          </strong>
          <span>{testResult.message}</span>
        </div>
      ) : null}
      {savedNotice ? (
        <div
          className={`${styles.resultNotice} ${styles.resultNoticePassed}`}
          role="status"
        >
          <strong>Настройки сохранены</strong>
          <span>Credential зашифрован и больше не возвращается в браузер.</span>
        </div>
      ) : null}

      <footer className={formStyles.formActions}>
        <div>
          {connection ? (
            <button
              className={formStyles.disconnectButton}
              disabled={busy}
              onClick={() => void disconnect()}
              type="button"
            >
              <Unplug aria-hidden="true" size={17} />
              Отключить
            </button>
          ) : null}
        </div>
        <div className={formStyles.primaryActions}>
          <button
            className={formStyles.secondaryButton}
            disabled={busy || !canTest}
            onClick={() => void test()}
            type="button"
          >
            {busyAction === "test" ? (
              <LoaderCircle className={formStyles.spinner} size={17} />
            ) : (
              <ExternalLink aria-hidden="true" size={17} />
            )}
            Проверить
          </button>
          <button
            className={formStyles.primaryButton}
            disabled={busy || !canSave}
            onClick={() => void save()}
            type="button"
          >
            {busyAction === "save" ? (
              <LoaderCircle className={formStyles.spinner} size={17} />
            ) : null}
            Сохранить
          </button>
        </div>
      </footer>
    </article>
  );
};
