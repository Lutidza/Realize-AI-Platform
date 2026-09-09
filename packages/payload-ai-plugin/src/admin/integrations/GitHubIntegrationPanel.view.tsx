/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubIntegrationPanel.view.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Отображает форму подключения GitHub, ошибки автора коммитов и результаты операций.
 */

"use client";

import {
  ExternalLink,
  GitFork,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Unplug,
} from "lucide-react";

import { formatGitHubTestStatus } from "./formatGitHubTestStatus.util";
import { GitHubConnectionFields } from "./GitHubConnectionFields.component";
import formStyles from "./GitHubConnectionForm.module.css";
import styles from "./GitHubIntegrationPanel.module.css";
import type { GitHubIntegrationPanelViewProps } from "./GitHubIntegrationPanel.types";

export const GitHubIntegrationPanelView = ({
  busyAction,
  connection,
  form,
  vaultConfigured,
}: GitHubIntegrationPanelViewProps) => (
  <article className={styles.detailPanel}>
    <header className={styles.integrationHeader}>
      <div className={styles.integrationIdentity}>
        <span className={styles.integrationLogo}>
          <GitFork aria-hidden="true" size={30} />
        </span>
        <div>
          <p className={styles.sectionEyebrow}>Development · Source control</p>
          <h2>GitHub</h2>
          <p>Репозиторий и credential для candidate refs и release workflow.</p>
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

    <GitHubConnectionFields {...form.fields} />

    {form.fields.commitAuthorError ? (
      <div
        className={`${styles.resultNotice} ${styles.resultNoticeFailed}`}
        id={form.fields.commitAuthorErrorID}
        role="alert"
      >
        <strong>Проверьте автора коммитов</strong>
        <span>{form.fields.commitAuthorError}</span>
      </div>
    ) : null}

    <div className={styles.connectionEvidence}>
      <div>
        <span>Состояние проверки</span>
        <strong>{formatGitHubTestStatus(connection)}</strong>
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

    {form.testResult ? (
      <div
        className={`${styles.resultNotice} ${
          form.testResult.status === "passed"
            ? styles.resultNoticePassed
            : styles.resultNoticeFailed
        }`}
        role="status"
      >
        <strong>
          {form.testResult.status === "passed"
            ? "Подключение работает"
            : "Проверка не пройдена"}
        </strong>
        <span>{form.testResult.message}</span>
      </div>
    ) : null}
    {form.hasSavedNotice ? (
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
            disabled={form.isBusy}
            onClick={() => void form.disconnect()}
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
          disabled={form.isBusy || !form.canTest}
          onClick={() => void form.test()}
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
          disabled={form.isBusy || !form.canSave}
          onClick={() => void form.save()}
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
