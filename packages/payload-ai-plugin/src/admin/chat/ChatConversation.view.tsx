/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatConversation.view.tsx
 * @version 1.2.1
 * @date 2026-09-11
 * @description Показывает разговор, прогресс ответа и закреплённую форму ввода.
 */

import { UiButton, UiNotice, UiSurface } from "@realize/ui-kit";
import { Activity, ArrowUpRight, Code2, Search, RotateCw } from "lucide-react";
import { CodexLogo } from "../integrations/codex/CodexLogo.component";
import { RunInspector } from "../RunInspector";
import { formatRunElapsed, runPhaseLabel } from "../runPresentation";
import { ChatWorkflowProgress } from "./ChatWorkflowProgress.component";
import { ChatComposer } from "./ChatComposer.component";
import { ChatMessage } from "./ChatMessage.component";
import type { ChatConversationViewProps } from "./ChatConversation.types";
import styles from "./ChatConversation.module.css";

export const ChatConversationView = ({
  controller,
  settings,
  bindViewport,
  bindInput,
  canSend,
  canClarifyChange,
  clarificationBlockedFor,
  clarifyChange,
  hintId,
  isBusy,
  submit,
  submitOnEnter,
  trackScroll,
  messages,
  changesByMessage,
  dataOperationsByMessage,
  selectSuggestion,
  showRunFeedback,
}: ChatConversationViewProps) => (
  <section className={styles.chat} aria-label="Чат с ассистентом">
    <div
      className={styles.messages}
      aria-live="polite"
      aria-relevant="additions text"
      onScroll={trackScroll}
      ref={bindViewport}
      data-testid="chat-messages"
    >
      {messages.length ? (
        messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            change={changesByMessage.get(message.id)}
            dataOperations={dataOperationsByMessage.get(message.id)}
            controller={controller}
            tools={settings.tools}
            canClarifyChange={canClarifyChange}
            clarificationBlocked={clarificationBlockedFor === message.id}
            onClarifyChange={clarifyChange}
          />
        ))
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyMark}>
            <CodexLogo width={28} height={28} />
          </div>
          <h2>
            {controller.selectedConversationID && !controller.detail
              ? "Загружаем диалог…"
              : "Чем помочь?"}
          </h2>
          <p>
            Обсудите задачу, приложите материалы или выберите файлы проекта.
          </p>
          <div className={styles.suggestions}>
            <UiButton
              className={styles.suggestion}
              disabled={isBusy || !controller.ready}
              onClick={() => selectSuggestion("Расскажи, как устроен проект")}
              variant="ghost"
            >
              <Code2 size={17} />
              <span>Разобраться в проекте</span>
              <ArrowUpRight size={15} />
            </UiButton>
            <UiButton
              className={styles.suggestion}
              disabled={isBusy || !controller.ready}
              onClick={() =>
                selectSuggestion("Найди, где реализован каталог товаров")
              }
              variant="ghost"
            >
              <Search size={17} />
              <span>Найти нужный раздел</span>
              <ArrowUpRight size={15} />
            </UiButton>
          </div>
        </div>
      )}
      {showRunFeedback ? (
        <UiSurface
          className={styles.runCard}
          data-testid="run-progress"
          role="status"
        >
          <div className={styles.runHeading}>
            <Activity size={15} aria-hidden="true" />
            <strong>
              {controller.isSubmitting
                ? "Готовим ответ…"
                : runPhaseLabel(controller.stream.phase)}
            </strong>
            {controller.currentRun ? (
              <span>{formatRunElapsed(controller.stream.elapsedSeconds)}</span>
            ) : null}
          </div>
          <div className={styles.messageContent}>
            {controller.stream.streamingMessage ||
              (controller.isSubmitting
                ? "Передаём сообщение ассистенту…"
                : "Изучаю контекст вашего проекта…")}
          </div>
          {controller.stream.issue ? (
            <UiNotice className={styles.runIssue} tone="danger">
              <span>{controller.stream.issue}</span>
              <UiButton
                onClick={controller.stream.retry}
                size="small"
                variant="ghost"
              >
                <RotateCw size={14} />
                Повторить подключение
              </UiButton>
            </UiNotice>
          ) : null}
        </UiSurface>
      ) : null}
      <ChatWorkflowProgress workflow={controller.workflow} />
      {settings.showActivity && controller.currentRun ? (
        <div className={styles.activity}>
          <RunInspector
            run={controller.currentRun}
            runtime={controller.runtime}
            stream={controller.stream}
          />
        </div>
      ) : null}
    </div>
    <ChatComposer
      controller={controller}
      settings={settings}
      bindInput={bindInput}
      canSend={canSend}
      hintId={hintId}
      isBusy={isBusy}
      submit={submit}
      submitOnEnter={submitOnEnter}
    />
  </section>
);
