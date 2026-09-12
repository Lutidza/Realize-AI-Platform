/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/WorkflowRunActions.component.tsx
 * @version 1.0.0
 * @date 2026-09-11
 * @description Показывает разрешённое действие текущего шага и сохранённый запрос повторной отправки.
 */

import { UiButton, UiNotice, UiSurface, UiTextarea } from "@realize/ui-kit";
import { Play, RefreshCw, Square } from "lucide-react";
import type { WorkflowRunActionsProps } from "./WorkflowRuns.types";
import styles from "./WorkflowRuns.module.css";

export const WorkflowRunActions = ({ controller }: WorkflowRunActionsProps) => {
  const { detail, continuation, latestRun } = controller;
  if (!detail) return null;
  const actions = detail.item.actions;
  const awaiting = detail.item.status === "awaiting_input";
  const prompt = detail.steps.find(
    (step) => step.key === latestRun?.workflow?.stepKey,
  )?.result;
  return (
    <UiSurface className={styles.actionPanel} aria-label="Действия запуска">
      <div className={styles.resultBar}>
        <h2>
          {awaiting
            ? "Нужен ваш ответ"
            : detail.item.status === "ready"
              ? "Следующий шаг готов"
              : detail.item.status === "completed"
                ? "Процесс завершён"
                : "Текущее состояние"}
        </h2>
        <UiButton
          variant="ghost"
          size="small"
          disabled={controller.isBusy || controller.loading}
          onClick={() => void continuation.refresh()}
        >
          <RefreshCw size={15} aria-hidden="true" />
          Обновить
        </UiButton>
      </div>
      {awaiting && prompt?.type === "text" ? (
        <p className={styles.text}>{prompt.text}</p>
      ) : null}
      {actions.reason ? <p className={styles.muted}>{actions.reason}</p> : null}
      {continuation.error ? (
        <UiNotice tone="danger" role="alert">
          {continuation.error} Введённый ответ сохранён.
        </UiNotice>
      ) : null}
      {continuation.hasRetry ? (
        <UiNotice>
          Результат продолжения не подтверждён. Повтор отправит исходный запрос
          с тем же ключом.
        </UiNotice>
      ) : null}
      {awaiting ? (
        <form
          className={styles.stack}
          onSubmit={(event) => {
            event.preventDefault();
            if (actions.reply) void continuation.continue();
          }}
        >
          <label className={styles.field}>
            <span>Ответ процессу</span>
            <UiTextarea
              rows={4}
              maxLength={8000}
              value={controller.draft}
              disabled={continuation.isLocked || !actions.reply}
              placeholder="Введите ответ для продолжения процесса"
              onChange={(event) => controller.setDraft(event.target.value)}
            />
          </label>
          <div className={styles.inline}>
            <UiButton
              type="submit"
              disabled={
                !actions.reply ||
                !continuation.canContinue ||
                (!continuation.hasRetry && !controller.draft.trim())
              }
            >
              {continuation.isPending
                ? "Отправляем…"
                : continuation.hasRetry
                  ? "Повторить продолжение"
                  : "Отправить ответ процессу"}
            </UiButton>
            <UiButton
              variant="ghost"
              disabled={controller.isLocked || !controller.draft}
              onClick={() => controller.setDraft("")}
            >
              Очистить ответ
            </UiButton>
          </div>
        </form>
      ) : null}
      <div className={styles.inline}>
        {!awaiting &&
        (actions.continue || actions.recover || continuation.hasRetry) ? (
          <UiButton
            disabled={!continuation.canContinue}
            onClick={() => void continuation.continue()}
          >
            <Play size={15} aria-hidden="true" />
            {continuation.isPending
              ? "Продолжаем…"
              : continuation.hasRetry
                ? "Повторить продолжение"
                : actions.recover
                  ? "Повторить запуск шага"
                  : "Продолжить процесс"}
          </UiButton>
        ) : null}
        {actions.cancel || controller.cancelRetry ? (
          <UiButton
            variant="secondary"
            disabled={
              controller.cancelling ||
              (!controller.cancelRetry && !controller.canCancel)
            }
            onClick={() => void controller.cancel()}
          >
            <Square size={14} aria-hidden="true" />
            {controller.cancelling
              ? "Останавливаем…"
              : controller.cancelRetry
                ? "Повторить остановку"
                : "Остановить выполнение"}
          </UiButton>
        ) : null}
      </div>
      {controller.cancelRetry ? (
        <UiNotice>
          Результат остановки не подтверждён. Повторите запрос или обновите
          состояние.
        </UiNotice>
      ) : null}
    </UiSurface>
  );
};
