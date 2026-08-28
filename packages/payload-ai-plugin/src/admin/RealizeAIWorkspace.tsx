/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAIWorkspace.tsx
 * @version 2026-08-28
 * @description Composes one focused agent workspace for page and drawer layouts.
 */

"use client";

import { History, Plus, Sparkles, TriangleAlert, X } from "lucide-react";
import { useState } from "react";

import { ChatPanel } from "./ChatPanel";
import { ConversationSidebar } from "./ConversationSidebar";
import { useRealizeAIController } from "./RealizeAIContext";
import styles from "./RealizeAIWorkspace.module.css";
import { RunInspector } from "./RunInspector";

type RealizeAIWorkspaceProps = {
  onClose?: () => void;
  variant: "drawer" | "page";
};

/** Renders a single controller through responsive page or drawer chrome. */
export const RealizeAIWorkspace = ({
  onClose,
  variant,
}: RealizeAIWorkspaceProps) => {
  const controller = useRealizeAIController();
  const [historyOpen, setHistoryOpen] = useState(false);
  const activeTitle =
    controller.detail?.conversation.title ||
    (controller.isCreatingConversation ? "Создаём диалог…" : "Новый диалог");
  const runtimeState = controller.runtime?.state || "unavailable";
  const runtimeLabel = controller.ready
    ? "Агент онлайн"
    : runtimeState === "disabled"
      ? "Агент отключён"
      : "Нет соединения";
  const runtimeNotice =
    runtimeState === "disabled"
      ? "Агент отключён в локальной конфигурации."
      : runtimeState === "unavailable"
        ? "Агент включён, но control plane пока недоступен."
        : undefined;
  const showInspector = variant === "page" && Boolean(controller.currentRun);
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
            <p className={styles.eyebrow}>Realize Agent</p>
            <h1>Управляйте проектом через диалог</h1>
            <p className={styles.intro}>
              Опишите задачу обычными словами. Агент изучит проект, покажет
              точный план и выполнит изменение только после подтверждения.
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
            ) : (
              <span className={styles.brandMark} aria-hidden="true">
                <Sparkles size={18} strokeWidth={1.9} />
              </span>
            )}
            <div className={styles.conversationTitle}>
              <strong>{activeTitle}</strong>
              <span>
                {variant === "drawer"
                  ? "Project copilot · approval-gated"
                  : "Контекст сохраняется между страницами админки"}
              </span>
            </div>
          </div>
          <div className={styles.toolbarActions}>
            <span className={styles.agentBadge} data-state={runtimeState}>
              <i aria-hidden="true" />
              {runtimeLabel}
            </span>
            {variant === "drawer" ? (
              <>
                <button
                  aria-label="Новый диалог"
                  className={styles.iconButton}
                  disabled={disabled}
                  onClick={() => void startConversation()}
                  type="button"
                >
                  <Plus size={18} />
                </button>
                <button
                  aria-label="Закрыть AI-ассистента"
                  className={styles.iconButton}
                  onClick={onClose}
                  type="button"
                >
                  <X size={19} />
                </button>
              </>
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
        {runtimeNotice ? (
          <div className={styles.notice} role="status">
            <TriangleAlert size={16} />
            <span>{runtimeNotice}</span>
          </div>
        ) : null}

        <div
          className={
            variant === "page"
              ? `${styles.pageLayout} ${
                  showInspector ? styles.pageLayoutWithInspector : ""
                }`
              : styles.drawerLayout
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
          {showInspector ? (
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
