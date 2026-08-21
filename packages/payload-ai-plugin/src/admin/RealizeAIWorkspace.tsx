/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAIWorkspace.tsx
 * @version 2026-08-21
 * @description Composes the shared modern chat surface for page and drawer layouts.
 */

"use client";

import { History, Plus, X } from "lucide-react";
import { useState } from "react";

import { ChatPanel } from "./ChatPanel";
import { ConversationSidebar } from "./ConversationSidebar";
import { useRealizeAIController } from "./RealizeAIContext";
import styles from "./RealizeAIWorkspace.module.css";
import { RunInspector } from "./RunInspector";

type RealizeAIWorkspaceProps = {
  variant: "drawer" | "page";
};

/** Renders a single controller through responsive page or drawer chrome. */
export const RealizeAIWorkspace = ({ variant }: RealizeAIWorkspaceProps) => {
  const controller = useRealizeAIController();
  const [historyOpen, setHistoryOpen] = useState(false);
  const activeTitle =
    controller.detail?.conversation.title ||
    (controller.isCreatingConversation ? "Создаём диалог…" : "Новый диалог");
  const runtimeState = controller.runtime?.state || "unavailable";
  const disabled =
    controller.isCreatingConversation ||
    controller.isSubmitting ||
    Boolean(controller.currentRun) ||
    !controller.ready;

  const openConversation = async (id: string) => {
    await controller.openConversation(id);
    setHistoryOpen(false);
  };
  const startConversation = async () => {
    await controller.startConversation();
    setHistoryOpen(false);
  };

  return (
    <section
      className={variant === "page" ? styles.page : styles.drawerSurface}
      data-surface={variant}
    >
      {variant === "page" ? (
        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>AI & Delivery</p>
            <h1>Ассистент проекта</h1>
            <p className={styles.intro}>
              Анализирует репозиторий, оформляет планы и запускает утверждённый
              code scope в изолированном worktree. Apply и deploy отделены.
            </p>
          </div>
          <span
            className={`${styles.status} ${styles[`status_${runtimeState}`]}`}
          >
            {controller.ready
              ? "Готов"
              : runtimeState === "disabled"
                ? "Отключён"
                : "Недоступен"}
          </span>
        </header>
      ) : null}

      <div className={styles.surface}>
        <header className={styles.toolbar}>
          <div className={styles.toolbarIdentity}>
            {variant === "drawer" ? (
              <button
                aria-label={historyOpen ? "Закрыть историю" : "Открыть историю"}
                className={styles.iconButton}
                onClick={() => setHistoryOpen((value) => !value)}
                type="button"
              >
                {historyOpen ? <X size={18} /> : <History size={18} />}
              </button>
            ) : null}
            <div className={styles.conversationTitle}>
              <strong>{activeTitle}</strong>
              <span>Контекст сохраняется между страницами админки</span>
            </div>
          </div>
          <div className={styles.toolbarActions}>
            <span className={styles.readOnlyBadge}>Approval-gated</span>
            {variant === "drawer" ? (
              <button
                aria-label="Новый диалог"
                className={styles.iconButton}
                disabled={disabled}
                onClick={() => void startConversation()}
                type="button"
              >
                <Plus size={18} />
              </button>
            ) : null}
          </div>
        </header>

        {controller.error ? (
          <div className={styles.error} role="alert">
            <span>{controller.error}</span>
            <button onClick={controller.clearError} type="button">
              Закрыть
            </button>
          </div>
        ) : null}
        {controller.runtime?.reason ? (
          <div className={styles.notice}>{controller.runtime.reason}</div>
        ) : null}

        <div
          className={
            variant === "page" ? styles.pageLayout : styles.drawerLayout
          }
        >
          {variant === "page" || historyOpen ? (
            <ConversationSidebar
              conversations={controller.conversations}
              disabled={disabled}
              onCreate={() => void startConversation()}
              onOpen={(id) => void openConversation(id)}
              onSearchChange={controller.setSearch}
              search={controller.search}
              selectedID={controller.selectedConversationID}
              variant={variant}
            />
          ) : null}
          {variant === "drawer" && historyOpen ? null : (
            <ChatPanel controller={controller} />
          )}
          {variant === "page" ? (
            <RunInspector
              run={controller.currentRun}
              runtime={controller.runtime}
              stream={controller.stream}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
};
