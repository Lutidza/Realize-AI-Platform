/**
 * @file packages/payload-ai-plugin/src/admin/ChatPanel.tsx
 * @version 2026-08-28
 * @description Отображает focused agent conversation, prompt input и approval-gated actions.
 */

"use client";

import {
  ArrowUp,
  ArrowUpRight,
  Bot,
  Database,
  FileCheck2,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Square,
} from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef } from "react";

import { ChangeRequestCard } from "./ChangeRequestCard";
import { DataOperationCard } from "./DataOperationCard";
import composerStyles from "./ChatComposer.module.css";
import type { RealizeAIController } from "./RealizeAIContext";
import { formatRunElapsed, runPhaseLabel } from "./runPresentation";
import styles from "./ChatPanel.module.css";

type ChatPanelProps = {
  controller: RealizeAIController;
};

const suggestions = [
  "Покажи, как устроен проект",
  "Найди owner каталога и его контракты",
  "Подготовь безопасный план изменения",
];

/** Renders messages and delegates every mutation to the provider controller. */
export const ChatPanel = ({ controller }: ChatPanelProps) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const messages = controller.detail?.messages || [];
  const changesByMessage = useMemo(
    () =>
      new Map(
        (controller.detail?.changeRequests || []).map((change) => [
          change.sourceMessageID,
          change,
        ]),
      ),
    [controller.detail?.changeRequests],
  );
  const dataOperationsByMessage = useMemo(
    () =>
      new Map(
        (controller.detail?.dataOperations || []).map((operation) => [
          operation.sourceMessageID,
          operation,
        ]),
      ),
    [controller.detail?.dataOperations],
  );
  const isRunPending = Boolean(controller.currentRun);
  const isBusy =
    controller.isCreatingConversation ||
    controller.isSubmitting ||
    isRunPending;
  const showRunFeedback = controller.isSubmitting || isRunPending;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport)
      viewport.scrollTo({ behavior: "smooth", top: viewport.scrollHeight });
  }, [messages.length, controller.stream.streamingMessage, showRunFeedback]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void controller.send();
  };
  const submitOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    if (controller.draft.trim() && !isBusy && controller.ready) {
      void controller.send();
    }
  };

  return (
    <section className={styles.chat} aria-label="Чат с ассистентом">
      <div className={styles.messages} aria-live="polite" ref={viewportRef}>
        {messages.length ? (
          messages.map((message) => {
            const change = changesByMessage.get(message.id);
            const dataOperation = dataOperationsByMessage.get(message.id);
            const isUser = message.role === "user";
            return (
              <div
                className={isUser ? styles.userRow : styles.assistantRow}
                key={message.id}
              >
                {!isUser ? (
                  <span className={styles.avatar} aria-hidden="true">
                    <Bot size={16} strokeWidth={1.8} />
                  </span>
                ) : null}
                <div className={styles.messageStack}>
                  <article
                    className={
                      isUser ? styles.userMessage : styles.assistantMessage
                    }
                  >
                    <div className={styles.messageMeta}>
                      <strong>{isUser ? "Вы" : "Realize Agent"}</strong>
                      <time dateTime={message.createdAt}>
                        {new Date(message.createdAt).toLocaleTimeString(
                          "ru-RU",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </time>
                    </div>
                    <div className={styles.messageContent}>
                      {message.content}
                    </div>
                  </article>
                  {!isUser &&
                  message.dataOperationIntentAvailable &&
                  !dataOperation ? (
                    <button
                      className={styles.planAction}
                      disabled={Boolean(controller.isPlanActionPending)}
                      onClick={() =>
                        void controller.createDataOperation(message.id)
                      }
                      type="button"
                    >
                      <Database size={15} />
                      {controller.isPlanActionPending === message.id
                        ? "Строим dry-run…"
                        : "Шаг 1 · Подготовить изменение данных"}
                    </button>
                  ) : null}
                  {!isUser &&
                  !message.dataOperationIntentAvailable &&
                  !change ? (
                    <button
                      className={styles.planAction}
                      disabled={Boolean(controller.isPlanActionPending)}
                      onClick={() =>
                        void controller.createChangeRequest(message.id)
                      }
                      type="button"
                    >
                      <FileCheck2 size={15} />
                      {controller.isPlanActionPending === message.id
                        ? "Оформляем…"
                        : "Оформить Change Request"}
                    </button>
                  ) : null}
                  {change ? (
                    <ChangeRequestCard
                      change={change}
                      onApprove={() =>
                        void controller.decideChangeRequest(change, "approve")
                      }
                      onAcceptImplementation={() =>
                        void controller.decideImplementation(change, "approve")
                      }
                      onAcceptPreview={() =>
                        void controller.decidePreview(change, "approve")
                      }
                      onApproveRelease={() =>
                        void controller.decideRelease(change, "approve")
                      }
                      onDeployPreview={() =>
                        void controller.deployPreview(change)
                      }
                      onExecute={() =>
                        void controller.executeChangeRequest(change)
                      }
                      onPrepareRelease={() =>
                        void controller.prepareRelease(change)
                      }
                      onPublishPullRequest={() =>
                        void controller.publishPullRequest(change)
                      }
                      onReject={(comment) =>
                        void controller.decideChangeRequest(
                          change,
                          "reject",
                          comment,
                        )
                      }
                      onRejectImplementation={(comment) =>
                        void controller.decideImplementation(
                          change,
                          "reject",
                          comment,
                        )
                      }
                      onRejectPreview={(comment) =>
                        void controller.decidePreview(change, "reject", comment)
                      }
                      onRejectRelease={(comment) =>
                        void controller.decideRelease(change, "reject", comment)
                      }
                      pending={controller.isPlanActionPending === change.id}
                    />
                  ) : null}
                  {dataOperation ? (
                    <DataOperationCard
                      onApply={() =>
                        void controller.applyDataOperation(dataOperation)
                      }
                      onApprove={() =>
                        void controller.decideDataOperation(
                          dataOperation,
                          "approve",
                        )
                      }
                      onApproveRollback={() =>
                        void controller.approveDataRollback(dataOperation)
                      }
                      onReject={(comment) =>
                        void controller.decideDataOperation(
                          dataOperation,
                          "reject",
                          comment,
                        )
                      }
                      onRollback={() =>
                        void controller.rollbackDataOperation(dataOperation)
                      }
                      operation={dataOperation}
                      pending={
                        controller.isPlanActionPending === dataOperation.id
                      }
                    />
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <Sparkles size={25} strokeWidth={1.7} />
            </span>
            <span className={styles.emptyEyebrow}>Агент проекта</span>
            <h2>
              {controller.selectedConversationID && !controller.detail
                ? "Загружаем диалог…"
                : "Что будем менять?"}
            </h2>
            <p>
              Опишите задачу обычными словами. Я изучу код и сначала покажу
              точный план — ничего не изменится без вашего подтверждения.
            </p>
            <div className={styles.suggestions}>
              {suggestions.map((suggestion) => (
                <button
                  disabled={isBusy || !controller.ready}
                  key={suggestion}
                  onClick={() => controller.setDraft(suggestion)}
                  type="button"
                >
                  <span>{suggestion}</span>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        )}

        {showRunFeedback ? (
          <div className={styles.assistantRow}>
            <span className={styles.avatar} aria-hidden="true">
              <Bot size={16} strokeWidth={1.8} />
            </span>
            <article
              className={styles.runCard}
              data-testid="run-progress"
              role="status"
            >
              <div className={styles.runHeading}>
                <span className={styles.pulse} />
                <strong>
                  {controller.isSubmitting
                    ? "Создаём запуск"
                    : runPhaseLabel(controller.stream.phase)}
                </strong>
                {controller.currentRun ? (
                  <span>
                    {formatRunElapsed(controller.stream.elapsedSeconds)}
                  </span>
                ) : null}
              </div>
              <div className={styles.messageContent}>
                {controller.stream.streamingMessage ||
                  (controller.isSubmitting
                    ? "Передаём вопрос ассистенту…"
                    : "Ассистент изучает контекст. Ответ появится после первого фрагмента.")}
              </div>
              {controller.stream.issue ? (
                <div className={styles.runIssue}>
                  <span>{controller.stream.issue}</span>
                  <button onClick={controller.stream.retry} type="button">
                    <RotateCw size={14} />
                    Повторить подключение
                  </button>
                </div>
              ) : null}
            </article>
          </div>
        ) : null}
      </div>

      <div className={composerStyles.composerWrap}>
        <form className={composerStyles.composer} onSubmit={submit}>
          <textarea
            aria-label="Сообщение ассистенту"
            disabled={isBusy || !controller.ready}
            maxLength={8_000}
            onChange={(event) => controller.setDraft(event.target.value)}
            onKeyDown={submitOnEnter}
            placeholder="Опишите, что нужно проверить или изменить…"
            rows={2}
            value={controller.draft}
          />
          <div className={composerStyles.composerFooter}>
            <span>Enter — отправить · Shift+Enter — новая строка</span>
            {controller.currentRun &&
            ["queued", "running"].includes(controller.currentRun.status) ? (
              <button
                aria-label="Остановить ответ"
                className={composerStyles.cancelButton}
                onClick={() => void controller.cancel()}
                type="button"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : null}
            <button
              aria-label="Отправить"
              className={composerStyles.sendButton}
              disabled={!controller.draft.trim() || isBusy || !controller.ready}
              type="submit"
            >
              <ArrowUp size={17} strokeWidth={2.2} />
            </button>
          </div>
        </form>
        <p className={composerStyles.guardrail}>
          <ShieldCheck size={13} aria-hidden="true" />
          Агент выполняет изменения только после вашего подтверждения.
        </p>
      </div>
    </section>
  );
};
