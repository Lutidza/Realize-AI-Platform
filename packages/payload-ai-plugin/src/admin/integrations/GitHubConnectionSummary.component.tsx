/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubConnectionSummary.component.tsx
 * @version 1.0.1
 * @date 2026-09-09
 * @description Показывает сохранённое состояние и результаты проверки подключения GitHub.
 */

import { UiBadge, UiSurface } from "@realize/ui-kit";
import { GitBranch, ShieldCheck } from "lucide-react";
import { GitHubLogo } from "./GitHubLogo.component";
import { formatGitHubTestStatus } from "./formatGitHubTestStatus.util";
import type { GitHubConnectionSummaryProps } from "./GitHubConnectionSummary.types";
import styles from "./IntegrationConnectionSummary.module.css";

export const GitHubConnectionSummary = ({
  connection,
}: GitHubConnectionSummaryProps) => (
  <aside aria-label="Сводка подключения" className={styles.sidebar}>
    <UiSurface asChild tone="accent">
      <section className={styles.overview}>
        <header className={styles.identity}>
          <UiSurface asChild className={styles.logo} tone="raised">
            <span aria-hidden="true">
              <GitHubLogo width={34} height={34} />
            </span>
          </UiSurface>
          <UiBadge dot tone={connection?.enabled ? "positive" : "neutral"}>
            {connection
              ? connection.enabled
                ? "Активна"
                : "Неактивна"
              : "Не настроено"}
          </UiBadge>
        </header>
        <div className={styles.name}>
          <p>Сохранённое подключение</p>
          <h2>{connection?.displayName || "GitHub"}</h2>
        </div>
        <dl className={styles.evidence}>
          <div>
            <dt>Состояние проверки</dt>
            <dd>{formatGitHubTestStatus(connection)}</dd>
          </div>
          <div>
            <dt>Ветка по умолчанию</dt>
            <dd className={styles.branch}>
              <GitBranch aria-hidden="true" size={16} />
              {connection?.configuration.defaultBranch || "—"}
            </dd>
          </div>
          <div>
            <dt>Последнее изменение</dt>
            <dd>
              {connection ? (
                <time dateTime={connection.updatedAt}>
                  {new Date(connection.updatedAt).toLocaleString("ru-RU")}
                </time>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
        <div className={styles.security}>
          <ShieldCheck aria-hidden="true" size={18} />
          <p>
            {connection?.hasCredential
              ? "Токен сохранён. Его значение скрыто и доступно только для замены."
              : "Добавьте токен доступа, чтобы завершить настройку."}
          </p>
        </div>
      </section>
    </UiSurface>
  </aside>
);
