/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexConnectionSummary.component.tsx
 * @version 1.1.0
 * @date 2026-09-09
 * @description Показывает сохранённый способ доступа, аккаунт и состояние проверки Codex.
 */

import { UiBadge, UiSurface } from "@realize/ui-kit";
import { ShieldCheck } from "lucide-react";
import styles from "../IntegrationConnectionSummary.module.css";
import type { CodexConnectionSummaryProps } from "./CodexConnectionSummary.types";
import { CodexLogo } from "./CodexLogo.component";
import { codexAuthOptions } from "./codexAuthOptions.config";

export const CodexConnectionSummary = ({
  connection,
}: CodexConnectionSummaryProps) => {
  const isWorkloadIdentity =
    connection?.configuration.authMode === "workloadIdentity";
  const hasAccessSource = Boolean(
    connection?.hasCredential || isWorkloadIdentity,
  );
  const option = codexAuthOptions.find(
    (item) =>
      item.authMode === connection?.configuration.authMode &&
      (!item.loginMethod ||
        item.loginMethod ===
          (connection?.configuration.loginMethod ?? "deviceCode")),
  );
  return (
    <aside aria-label="Сводка подключения" className={styles.sidebar}>
      <UiSurface asChild tone="accent">
        <section className={styles.overview}>
          <header className={styles.identity}>
            <UiSurface asChild className={styles.logo} tone="raised">
              <span aria-hidden="true">
                <CodexLogo width={34} height={34} />
              </span>
            </UiSurface>
            <UiBadge
              dot
              tone={
                connection?.enabled && hasAccessSource ? "positive" : "neutral"
              }
            >
              {connection
                ? hasAccessSource
                  ? connection.enabled
                    ? "Активна"
                    : "Неактивна"
                  : "Требуется вход"
                : "Не настроено"}
            </UiBadge>
          </header>
          <div className={styles.name}>
            <p>Сохранённое подключение</p>
            <h2>{connection?.displayName || "GPT — Codex"}</h2>
          </div>
          <dl className={styles.evidence}>
            <div>
              <dt>Способ доступа</dt>
              <dd>{option?.label ?? "—"}</dd>
            </div>
            {connection && connection.configuration.authMode !== "apiKey" ? (
              <>
                <div>
                  <dt>Аккаунт</dt>
                  <dd>
                    {connection.configuration.accountEmail || "Не указан"}
                  </dd>
                </div>
                <div>
                  <dt>План</dt>
                  <dd>{connection.configuration.planType || "Не указан"}</dd>
                </div>
              </>
            ) : null}
            <div>
              <dt>Состояние проверки</dt>
              <dd>
                {connection?.lastTestStatus === "passed"
                  ? "Проверка пройдена"
                  : connection?.lastTestStatus === "failed"
                    ? "Проверка не пройдена"
                    : "Ещё не проверено"}
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
              {isWorkloadIdentity
                ? "Доступ предоставляет серверная инфраструктура. Постоянный токен в CMS не хранится."
                : connection?.hasCredential
                  ? "Данные доступа сохранены. Их значение скрыто и не передаётся в браузер."
                  : "Выберите способ подключения и настройте доступ."}
            </p>
          </div>
        </section>
      </UiSurface>
    </aside>
  );
};
