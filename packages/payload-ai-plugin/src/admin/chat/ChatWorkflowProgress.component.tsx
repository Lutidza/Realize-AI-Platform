/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatWorkflowProgress.component.tsx
 * @version 1.0.0
 * @date 2026-09-11
 * @description Показывает фактический checkpoint процесса и явные действия продолжения.
 */

import { GitBranch, RefreshCw } from "lucide-react";
import { UiButton, UiNotice, UiSelect, UiSurface } from "@realize/ui-kit";
import type { ChatWorkflowProgressProps } from "./ChatWorkflow.types";
import styles from "./ChatConversation.module.css";

const phaseLabels = {
  ready: "Готов к следующему шагу",
  running: "Выполняется",
  awaiting_input: "Ожидает ваш ответ",
  completed: "Завершён",
  blocked: "Заблокирован",
};

/** Исторический checkpoint доступен после перезагрузки; продолжение не меняет выпуск. */
export const ChatWorkflowProgress = ({
  workflow,
}: ChatWorkflowProgressProps) => {
  const { run } = workflow;
  const state = run?.workflow;
  if (!run || !state) return null;
  const queuedRecovery = run.status === "queued" && state.phase === "running";
  const waiting =
    state.phase === "awaiting_input" && run.status === "completed";
  return (
    <UiSurface
      className={styles.runCard}
      aria-label="Выполнение рабочего процесса"
    >
      {workflow.runs.length > 1 && (
        <UiSelect
          aria-label="Процессы в диалоге"
          value={run.id}
          disabled={workflow.isPending || workflow.hasRetry}
          onChange={(event) => workflow.selectRun(event.target.value)}
        >
          {workflow.runs.map((item) => (
            <option value={item.id} key={item.id}>
              {item.workflow?.title || item.workflow?.key} ·{" "}
              {new Date(item.createdAt).toLocaleString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · {phaseLabels[item.workflow!.phase]}
            </option>
          ))}
        </UiSelect>
      )}
      <div className={styles.runHeading}>
        <GitBranch size={15} aria-hidden="true" />
        <strong>{state.title || state.key}</strong>
        <UiButton
          size="icon"
          variant="ghost"
          aria-label="Обновить состояние процесса"
          disabled={workflow.isRefreshing || workflow.isPending}
          onClick={() => void workflow.refresh()}
        >
          <RefreshCw size={15} />
        </UiButton>
      </div>
      <p className={styles.messageContent} role="status">
        {run.status === "cancelled"
          ? "Остановлен"
          : run.status === "failed"
            ? "Ошибка выполнения"
            : phaseLabels[state.phase]}{" "}
        · Выполнено шагов: {state.completedSteps}
      </p>
      <p className={styles.messageContent}>Текущий шаг: {state.stepKey}</p>
      {state.reason && (
        <UiNotice
          className={styles.runIssue}
          tone={state.phase === "blocked" ? "danger" : undefined}
        >
          {state.reason}
        </UiNotice>
      )}
      {workflow.error && (
        <UiNotice className={styles.runIssue} tone="danger" role="alert">
          {workflow.error} Ваш текст сохранён. Обновите состояние или повторите
          запрос.
        </UiNotice>
      )}
      {workflow.hasRetry && (
        <p className={styles.messageContent}>
          Результат запроса не подтверждён. Повтор отправит тот же запрос.
        </p>
      )}
      {(queuedRecovery || state.phase === "ready" || workflow.hasRetry) && (
        <UiButton
          size="small"
          disabled={!workflow.canContinue}
          onClick={() => void workflow.continue()}
        >
          {workflow.isPending
            ? "Продолжаем…"
            : workflow.hasRetry
              ? "Повторить продолжение"
              : queuedRecovery
                ? "Повторить запуск шага"
                : "Продолжить процесс"}
        </UiButton>
      )}
      {waiting && !workflow.hasRetry && (
        <>
          <p className={styles.messageContent}>
            {workflow.isReplying
              ? "Введите ответ в поле сообщения. Для этого шага доступен только текст."
              : "Процесс сохранён и ждёт вашего ответа."}
          </p>
          <UiButton
            variant="ghost"
            size="small"
            disabled={workflow.isPending}
            onClick={() => workflow.setReplying(!workflow.isReplying)}
          >
            {workflow.isReplying
              ? "Вернуться к обычному чату"
              : "Ответить на запрос процесса"}
          </UiButton>
        </>
      )}
    </UiSurface>
  );
};
