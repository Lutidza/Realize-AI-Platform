/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatComposer.component.tsx
 * @version 1.3.0
 * @date 2026-09-11
 * @description Соединяет текст, вложения, файлы проекта и веб-поиск в одной форме.
 */

"use client";
import { UiButton, UiNotice, UiSurface, UiTextarea } from "@realize/ui-kit";
import { ArrowUp, AtSign, Globe, Paperclip, Square } from "lucide-react";
import { AdminMenu } from "../ui/AdminMenu.component";
import { ChatPendingFiles } from "./ChatPendingFiles.component";
import { ChatWorkflowSelection } from "./ChatWorkflowSelection.component";
import { ChatAgentConfiguration } from "./ChatAgentConfiguration.component";
import { ProjectFilePicker } from "./ProjectFilePicker.component";
import { useChatComposer } from "./useChatComposer.hook";
import type { ChatComposerProps } from "./ChatComposer.types";
import styles from "./ChatComposer.module.css";
export const ChatComposer = ({
  controller,
  settings,
  bindInput,
  canSend,
  hintId,
  isBusy,
  submit,
  submitOnEnter,
}: ChatComposerProps) => {
  const { context } = controller;
  const { capabilities } = context;
  const workflowReply = controller.workflow.isReplying;
  const locked =
    controller.isSubmitting ||
    controller.workflow.isPending ||
    controller.detail?.conversation.status === "archived";
  const filesLocked =
    locked || workflowReply || Boolean(controller.workflow.key);
  const {
    bindFileInput,
    isDragging,
    chooseFiles,
    onPaste,
    onDragOver,
    onDragLeave,
    onDrop,
  } = useChatComposer(context, filesLocked);
  const limits = capabilities?.attachments;
  return (
    <div className={styles.wrap}>
      {!workflowReply && (
        <>
          <ChatAgentConfiguration
            configuration={controller.agentConfiguration}
            disabled={
              locked ||
              Boolean(controller.pendingWorkflowConversationID) ||
              controller.workflow.hasRetry ||
              controller.isCreatingConversation
            }
          />
          <ChatWorkflowSelection
            controller={controller}
            disabled={
              locked ||
              Boolean(controller.pendingWorkflowConversationID) ||
              controller.workflow.hasRetry ||
              controller.isCreatingConversation
            }
          />
        </>
      )}
      {workflowReply && (
        <p className={styles.caption}>
          Ответ на запрос процесса · {controller.workflow.run?.workflow?.title}
        </p>
      )}
      {controller.pendingWorkflowConversationID && (
        <UiNotice role="status">
          Результат запуска процесса не подтверждён. Повтор отправит исходное
          сообщение и данные.
          {controller.pendingWorkflowConversationID !==
            controller.selectedConversationID && (
            <UiButton
              variant="ghost"
              size="small"
              onClick={() =>
                void controller.openConversation(
                  controller.pendingWorkflowConversationID!,
                )
              }
            >
              Открыть диалог процесса
            </UiButton>
          )}
        </UiNotice>
      )}
      {controller.workflow.pendingConversationID &&
        controller.workflow.pendingConversationID !==
          controller.selectedConversationID && (
          <UiNotice role="status">
            Продолжение процесса в другом диалоге требует проверки результата.
            <UiButton
              variant="ghost"
              size="small"
              onClick={() =>
                void controller.openConversation(
                  controller.workflow.pendingConversationID!,
                )
              }
            >
              Открыть ожидающий процесс
            </UiButton>
          </UiNotice>
        )}
      {context.error ? (
        <UiNotice className={styles.error} tone="danger" role="alert">
          <span>{context.error}</span>
          <UiButton size="small" variant="ghost" onClick={context.clearError}>
            Закрыть
          </UiButton>
        </UiNotice>
      ) : null}
      <UiSurface
        className={styles.surface}
        data-dragging={isDragging}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <form className={styles.form} onSubmit={submit}>
          {context.attachments.length || context.projectFiles.length ? (
            <ChatPendingFiles context={context} disabled={locked} />
          ) : null}
          <UiTextarea
            appearance="plain"
            aria-describedby={hintId}
            aria-label="Сообщение ассистенту"
            className={styles.input}
            disabled={locked || !controller.ready}
            maxLength={8000}
            onChange={(event) => controller.setDraft(event.target.value)}
            onKeyDown={submitOnEnter}
            onPaste={onPaste}
            placeholder={
              workflowReply
                ? "Введите ответ для продолжения процесса…"
                : "Спросите Codex или опишите задачу…"
            }
            ref={bindInput}
            rows={2}
            value={controller.draft}
          />
          <div className={styles.footer}>
            <div className={styles.tools}>
              {limits?.available ? (
                <>
                  <input
                    className={styles.fileInput}
                    ref={bindFileInput}
                    type="file"
                    multiple
                    disabled={filesLocked}
                    accept={limits.extensions.join(",")}
                    aria-label="Выбрать вложения"
                    onChange={(event) => {
                      context.addAttachments(
                        Array.from(event.target.files ?? []),
                      );
                      event.target.value = "";
                    }}
                  />
                  <AdminMenu
                    label="Прикрепить файлы"
                    icon={<Paperclip size={18} />}
                    placement="top"
                    align="left"
                    disabled={filesLocked}
                  >
                    <UiButton
                      onClick={chooseFiles}
                      variant="ghost"
                      size="small"
                    >
                      <Paperclip size={16} />
                      Загрузить с устройства
                    </UiButton>
                    <p className={styles.support}>
                      JPEG, PNG, WebP — до{" "}
                      {Math.round(limits.maxImageBytes / 1048576)} МБ.
                      <br />
                      Текст и код — до {Math.round(
                        limits.maxTextBytes / 1024,
                      )}{" "}
                      КБ.
                      <br />
                      До {limits.maxFiles} файлов, всего{" "}
                      {Math.round(limits.maxTotalBytes / 1048576)} МБ.
                    </p>
                    <p className={styles.extensions}>
                      {limits.extensions.join(" · ")}
                    </p>
                  </AdminMenu>
                </>
              ) : null}
              {capabilities?.projectFiles.available ? (
                <AdminMenu
                  label="Выбрать файлы проекта"
                  icon={<AtSign size={18} />}
                  placement="top"
                  align="left"
                  wide
                  disabled={filesLocked}
                >
                  <ProjectFilePicker context={context} disabled={filesLocked} />
                </AdminMenu>
              ) : null}
              {capabilities?.webSearch.available ? (
                <UiButton
                  aria-label="Веб-поиск"
                  title="Веб-поиск"
                  aria-pressed={context.webSearch}
                  onClick={() => context.setWebSearch(!context.webSearch)}
                  disabled={locked || (workflowReply && !context.webSearch)}
                  variant="ghost"
                  size="small"
                >
                  <Globe size={16} />
                  <span className={styles.webLabel}>Веб-поиск</span>
                </UiButton>
              ) : null}
            </div>
            <div className={styles.actions}>
              {controller.currentRun &&
              ["queued", "running"].includes(controller.currentRun.status) ? (
                <UiButton
                  aria-label="Остановить ответ"
                  onClick={() => void controller.cancel()}
                  size="icon"
                  variant="secondary"
                >
                  <Square size={14} fill="currentColor" />
                </UiButton>
              ) : (
                <UiButton
                  aria-label={
                    controller.pendingWorkflowConversationID
                      ? "Повторить запуск процесса"
                      : workflowReply
                        ? "Отправить ответ процессу"
                        : "Отправить"
                  }
                  disabled={!canSend || isBusy}
                  size="icon"
                  type="submit"
                >
                  <ArrowUp size={18} />
                </UiButton>
              )}
            </div>
          </div>
        </form>
      </UiSurface>
      <p className={styles.caption} id={hintId}>
        {context.hasPendingAttachments
          ? "Файлы загружаются — дождитесь завершения"
          : context.hasFailedAttachments
            ? "Повторите загрузку или удалите файл с ошибкой"
            : settings.sendOnEnter
              ? "Enter — отправить · Shift+Enter — новая строка"
              : "Enter — новая строка"}
      </p>
    </div>
  );
};
