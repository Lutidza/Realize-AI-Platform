/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexBrowserLogin.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Показывает официальный браузерный вход и завершение для удалённого сервера.
 */

import { UiButton, UiInput, UiSurface } from "@realize/ui-kit";
import { ArrowUpRight } from "lucide-react";
import type { CodexBrowserLoginProps } from "./CodexBrowserLogin.types";
import styles from "./CodexLogin.module.css";
import fieldStyles from "../IntegrationConnectionForm.module.css";

export const CodexBrowserLogin = ({
  session,
  callbackURL,
  isBusy,
  onCallbackURLChange,
  onComplete,
  onCancel,
}: CodexBrowserLoginProps) => (
  <UiSurface asChild tone="raised">
    <div className={styles.login}>
      <p role="status">
        Подтвердите доступ на сайте OpenAI. Подключение сохранится после
        завершения входа.
      </p>
      <a
        className={styles.verificationLink}
        href={session.authorizationURL}
        target="_blank"
        rel="noopener noreferrer"
      >
        Войти в ChatGPT <ArrowUpRight aria-hidden="true" size={16} />
        <span className={styles.externalHint}>(новая вкладка)</span>
      </a>
      <details className={styles.remoteDetails}>
        <summary>
          CMS на удалённом сервере или страница возврата не открылась
        </summary>
        <div className={styles.remoteContent}>
          <p>
            После подтверждения OpenAI перенаправляет на localhost. Если этот
            адрес не открылся, скопируйте его целиком из адресной строки и
            вставьте ниже.
          </p>
          <label className={fieldStyles.field}>
            <span>Адрес возврата после входа</span>
            <UiInput
              autoComplete="off"
              autoCapitalize="none"
              disabled={isBusy}
              maxLength={8192}
              onChange={(event) => onCallbackURLChange(event.target.value)}
              placeholder="http://localhost:1455/auth/callback?…"
              spellCheck={false}
              type="password"
              value={callbackURL}
            />
            <small>
              Адрес содержит одноразовый код. Он передаётся только для
              завершения этой попытки входа.
            </small>
          </label>
          <UiButton
            disabled={isBusy || !callbackURL.trim()}
            onClick={() => void onComplete()}
          >
            Завершить вход
          </UiButton>
        </div>
      </details>
      <p className={styles.expiration}>
        Попытка действует до{" "}
        <time dateTime={session.expiresAt}>
          {new Date(session.expiresAt).toLocaleTimeString("ru-RU")}
        </time>
        .
      </p>
      <UiButton
        disabled={isBusy}
        onClick={() => void onCancel()}
        variant="secondary"
      >
        Отменить вход
      </UiButton>
    </div>
  </UiSurface>
);
