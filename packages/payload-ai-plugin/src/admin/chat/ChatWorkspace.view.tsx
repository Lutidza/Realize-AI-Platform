/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatWorkspace.view.tsx
 * @version 1.2.0
 * @date 2026-09-11
 * @description Размещает панель инструментов, историю и разговор в ограниченной области чата.
 */

import { UiButton, UiNotice, UiSurface } from "@realize/ui-kit";
import { TriangleAlert } from "lucide-react";
import { ChatConversation } from "./ChatConversation.component";
import { ChatToolbar } from "./ChatToolbar.component";
import { ConversationHistory } from "./ConversationHistory.component";
import type { ChatWorkspaceViewProps } from "./ChatWorkspace.types";
import styles from "./ChatWorkspace.module.css";

export const ChatWorkspaceView = (props: ChatWorkspaceViewProps) => {
  const { controller, settings, variant, workspace } = props;
  const runtimeState = controller.runtime?.state;
  const notice = !controller.ready
    ? controller.runtime?.reason ||
      (runtimeState === "disabled"
        ? "Админский агент выключен в настройках GPT — Codex. Сохранённые диалоги доступны для просмотра."
        : "Нет соединения с ассистентом. Сохранённые диалоги доступны для просмотра.")
    : undefined;

  return (
    <UiSurface
      appearance={variant === "panel" ? "flush" : "card"}
      className={styles.workspace}
      data-surface={variant}
      data-testid="chat-workspace"
    >
      <ChatToolbar {...props} />
      {controller.error ? (
        <UiNotice className={styles.notice} role="alert" tone="danger">
          <span>{controller.error}</span>
          <UiButton
            onClick={controller.clearError}
            size="small"
            variant="ghost"
          >
            Закрыть
          </UiButton>
        </UiNotice>
      ) : null}
      {notice ? (
        <UiNotice
          className={styles.notice}
          icon={<TriangleAlert size={16} />}
          role="status"
        >
          <span>{notice}</span>
          {props.onOpenSettings ? (
            <UiButton
              size="small"
              variant="ghost"
              onClick={props.onOpenSettings}
            >
              Настройки агента
            </UiButton>
          ) : null}
        </UiNotice>
      ) : null}
      <div className={styles.layout}>
        {workspace.isHistoryOpen ? (
          <ConversationHistory
            conversations={controller.conversations}
            id={workspace.historyId}
            onClose={workspace.closeHistory}
            onOpen={(id) => void workspace.openConversation(id)}
            onStart={() => void workspace.startConversation()}
            onArchive={controller.archiveConversation}
            busy={workspace.isBusy}
            canStart={controller.ready}
            onSearchChange={controller.setSearch}
            search={controller.search}
            selectedId={controller.selectedConversationID}
          />
        ) : null}
        <ChatConversation controller={controller} settings={settings} />
      </div>
    </UiSurface>
  );
};
