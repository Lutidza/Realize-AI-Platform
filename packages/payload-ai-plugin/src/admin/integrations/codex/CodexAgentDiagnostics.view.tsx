/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexAgentDiagnostics.view.tsx
 * @version 1.1.0
 * @date 2026-09-11
 * @description Показывает состояние чата и исполнителя, разрешения и проверку доступа к аккаунту.
 */

import { UiBadge, UiButton, UiNotice } from "@realize/ui-kit";
import { Activity, CheckCircle2, RefreshCw } from "lucide-react";
import { IntegrationFormSection } from "../IntegrationFormSection.component";
import { CodexAccessTestResult } from "./CodexAccessTestResult.component";
import type { CodexAgentDiagnosticsViewProps } from "./CodexAgentDiagnostics.types";
import styles from "./CodexAgentDiagnostics.module.css";
import settings from "./CodexChatSettings.module.css";

/** Состояние исполнителя основано на свежем heartbeat, авторизация проверяется отдельным действием. */
export const CodexAgentDiagnosticsView = ({
  state,
  onTest,
  isTesting,
  isTestDisabled,
  testResult,
  testError,
}: CodexAgentDiagnosticsViewProps) => {
  const data = state.diagnostics;
  return (
    <IntegrationFormSection
      title="Состояние агента"
      description="Текущее состояние по сохранённым настройкам. Несохранённые изменения формы здесь не учитываются."
      icon={<Activity size={20} />}
    >
      {state.isLoading ? (
        <UiNotice tone="neutral" role="status">
          Обновляем состояние агента…
        </UiNotice>
      ) : null}
      {state.error ? (
        <UiNotice tone="danger" role="alert" title="Состояние недоступно">
          {state.error}
          <div className={settings.actions}>
            <UiButton variant="secondary" onClick={state.refresh}>
              <RefreshCw size={16} /> Обновить состояние
            </UiButton>
          </div>
        </UiNotice>
      ) : null}
      {data ? (
        <>
          <UiNotice
            tone={
              data.runtime.state === "ready"
                ? "positive"
                : data.runtime.state === "disabled"
                  ? "neutral"
                  : "danger"
            }
            title={
              data.runtime.state === "ready"
                ? "Готов к работе в чате"
                : data.runtime.state === "disabled"
                  ? "Агент выключен"
                  : "Агент недоступен"
            }
          >
            {data.runtime.reason ||
              "Подключение настроено, сервис чата доступен. Авторизация аккаунта проверяется отдельно ниже."}
          </UiNotice>
          <dl className={styles.metadata}>
            <div>
              <dt>Подключение</dt>
              <dd>{data.connection?.displayName || "Не настроено"}</dd>
            </div>
            <div>
              <dt>Способ доступа</dt>
              <dd>
                {data.connection
                  ? {
                      chatgpt: "Аккаунт ChatGPT",
                      apiKey: "OpenAI API key",
                      accessToken: "Токен рабочего пространства",
                      workloadIdentity: "Серверная идентификация",
                    }[data.connection.authMode]
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Основная модель</dt>
              <dd>{data.models.model || "Выбор провайдера"}</dd>
            </div>
            <div>
              <dt>Модель проверки</dt>
              <dd>{data.models.reviewModel || "Как у агента"}</dd>
            </div>
          </dl>
          <UiNotice
            tone={
              data.worker.state === "available"
                ? "positive"
                : data.worker.state === "busy"
                  ? "neutral"
                  : "danger"
            }
            title={
              {
                available: "Исполнитель доступен",
                busy: "Исполнитель занят",
                unavailable: "Исполнитель недоступен",
              }[data.worker.state]
            }
          >
            {data.worker.reason}
          </UiNotice>
          <dl className={styles.metadata}>
            <div>
              <dt>Последний сигнал исполнителя</dt>
              <dd>
                {data.worker.lastSeenAt ? (
                  <time dateTime={data.worker.lastSeenAt}>
                    {new Date(data.worker.lastSeenAt).toLocaleString("ru-RU")}
                  </time>
                ) : (
                  "Ещё не получен"
                )}
              </dd>
            </div>
            <div>
              <dt>Текущее задание</dt>
              <dd>
                {data.worker.currentJob ? (
                  <>
                    {
                      {
                        execution: "Изменения кода",
                        preview: "Предварительный просмотр",
                        release: "Подготовка выпуска",
                        sourcePromotion: "Публикация Pull Request",
                      }[data.worker.currentJob.kind]
                    }
                    {" · Запрос №"}
                    {data.worker.currentJob.changeRequestID}
                  </>
                ) : data.worker.state === "unavailable" ? (
                  "Нет актуальных данных"
                ) : (
                  "Нет активного задания"
                )}
              </dd>
            </div>
          </dl>
          <ul className={styles.operations} aria-label="Разрешения операций">
            {(
              [
                ["execution", "Изменения кода"],
                ["preview", "Предварительный просмотр"],
                ["release", "Подготовка выпуска"],
                ["sourcePromotion", "Публикация Pull Request"],
              ] as const
            ).map(([key, label]) => (
              <li className={styles.operation} key={key}>
                <div className={styles.operationHeading}>
                  <strong>{label}</strong>
                  <UiBadge
                    tone={
                      data.operations[key].state === "allowed"
                        ? "positive"
                        : data.operations[key].state === "blocked"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {
                      {
                        allowed: "Разрешено",
                        disabled: "Выключено",
                        blocked: "Недоступно",
                      }[data.operations[key].state]
                    }
                  </UiBadge>
                </div>
                {data.operations[key].state === "blocked" ? (
                  <p className={settings.hint}>{data.operations[key].reason}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <p className={settings.hint}>
            Состояние обновляется автоматически, пока вкладка открыта.
            Разрешённые операции требуют подтверждения конкретного изменения.
          </p>
          <p className={settings.hint}>
            Состояние обновлено:{" "}
            <time dateTime={data.checkedAt}>
              {new Date(data.checkedAt).toLocaleString("ru-RU")}
            </time>
          </p>
          <dl className={styles.metadata}>
            <div>
              <dt>Последняя проверка доступа</dt>
              <dd>
                {
                  {
                    never: "Ещё не выполнялась",
                    passed: "Доступ подтверждён",
                    failed: "Проверка не пройдена",
                  }[data.accessTest.status]
                }
                {data.accessTest.checkedAt ? (
                  <time
                    className={styles.testTime}
                    dateTime={data.accessTest.checkedAt}
                  >
                    {new Date(data.accessTest.checkedAt).toLocaleString(
                      "ru-RU",
                    )}
                  </time>
                ) : null}
              </dd>
            </div>
          </dl>
        </>
      ) : null}
      {testError ? (
        <UiNotice tone="danger" role="alert" title="Действие не завершено">
          {testError}
        </UiNotice>
      ) : null}
      <CodexAccessTestResult result={testResult} />
      <div className={settings.actions}>
        <UiButton
          variant="secondary"
          disabled={isTestDisabled}
          onClick={() => void onTest()}
        >
          <CheckCircle2 size={16} />
          {isTesting ? "Проверяем доступ…" : "Проверить доступ"}
        </UiButton>
      </div>
      <p className={settings.hint}>
        Проверка подтверждает авторизацию сохранённого подключения без запроса
        ответа модели. Сначала сохраните изменения и завершите другие действия.
      </p>
    </IntegrationFormSection>
  );
};
