/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexDeviceLogin.component.tsx
 * @version 1.0.1
 * @date 2026-09-09
 * @description Показывает одноразовый код, официальный адрес входа и управление попыткой авторизации.
 */

import { UiButton, UiSurface } from "@realize/ui-kit";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import type { CodexDeviceLoginProps } from "./CodexDeviceLogin.types";
import styles from "./CodexLogin.module.css";

export const CodexDeviceLogin = ({
  isCancelling,
  isCopied,
  onCancel,
  onCopy,
  session,
}: CodexDeviceLoginProps) => (
  <UiSurface asChild tone="raised">
    <div className={styles.login}>
      <p role="status">Ожидаем подтверждение входа в OpenAI.</p>
      <div className={styles.codeRow}>
        <code aria-label="Одноразовый код входа" className={styles.code}>
          {session.userCode}
        </code>
        <UiButton
          aria-label={isCopied ? "Код скопирован" : "Копировать код"}
          disabled={isCancelling}
          onClick={() => void onCopy()}
          size="icon"
          variant="secondary"
        >
          {isCopied ? (
            <Check aria-hidden="true" size={18} />
          ) : (
            <Copy aria-hidden="true" size={18} />
          )}
        </UiButton>
      </div>
      <a
        className={styles.verificationLink}
        href={session.verificationURL}
        rel="noopener noreferrer"
        target="_blank"
      >
        Открыть страницу входа
        <ArrowUpRight aria-hidden="true" size={16} />
        <span className={styles.externalHint}> (новая вкладка)</span>
      </a>
      <p className={styles.expiration}>
        Код действует до{" "}
        <time dateTime={session.expiresAt}>
          {new Date(session.expiresAt).toLocaleTimeString("ru-RU")}
        </time>
        . После подтверждения страница обновится автоматически.
      </p>
      <UiButton
        aria-busy={isCancelling}
        disabled={isCancelling}
        onClick={() => void onCancel()}
        variant="secondary"
      >
        Отменить вход
      </UiButton>
    </div>
  </UiSurface>
);
