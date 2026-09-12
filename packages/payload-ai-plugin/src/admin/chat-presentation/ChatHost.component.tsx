/**
 * @file packages/payload-ai-plugin/src/admin/chat-presentation/ChatHost.component.tsx
 * @version 1.1.0
 * @date 2026-09-10
 * @description Размещает launcher и немодальную правую панель рядом с содержимым Admin.
 */

"use client";

import { Sparkles, X } from "lucide-react";
import { useId } from "react";
import { UiButton, UiNotice, UiSurface } from "@realize/ui-kit";
import { AdminUiTheme } from "../AdminUiTheme.component";
import { ChatWorkspace } from "../chat/ChatWorkspace.component";
import { useChatPresentation } from "./useChatPresentation.hook";
import { useChatPanelFocus } from "./useChatPanelFocus.hook";
import { ChatPanelResize } from "./ChatPanelResize.component";
import type { ChatHostProps } from "./ChatPanel.types";
import styles from "./ChatHost.module.css";

/** Панель не перехватывает внешние clicks и не блокирует работу основной страницы. */
export const ChatHost = ({ rootRef }: ChatHostProps) => {
  const panelId = useId();
  const presentation = useChatPresentation();
  const { panelRef, onKeyDown } = useChatPanelFocus(
    Boolean(presentation?.panelOpen),
    () => presentation?.closeChat(),
  );
  if (!presentation || presentation.isWindow) return null;
  const {
    settings,
    panelOpen,
    isPage,
    isSettings,
    isLoading,
    error,
    notice,
    openChat,
    closeChat,
    openSettings,
    refreshSettings,
    clearNotice,
  } = presentation;
  return (
    <AdminUiTheme>
      {(notice || error) && !isPage ? (
        <UiNotice className={styles.notice} role="alert" tone="danger">
          <span>{notice || error}</span>
          {error ? (
            <UiButton
              size="small"
              variant="ghost"
              onClick={() => void refreshSettings()}
            >
              Повторить
            </UiButton>
          ) : null}
          {notice ? (
            <UiButton
              size="icon"
              variant="ghost"
              aria-label="Закрыть уведомление чата"
              onClick={clearNotice}
            >
              <X size={16} />
            </UiButton>
          ) : null}
        </UiNotice>
      ) : null}
      {!panelOpen && !isPage && !isSettings ? (
        <UiButton
          aria-label="Открыть AI-ассистента"
          className={styles.launcher}
          data-testid="realize-ai-launcher"
          disabled={!settings}
          onClick={() => openChat()}
          type="button"
        >
          <Sparkles size={18} />
          <span>
            {!settings && isLoading ? "Загрузка чата…" : "Спросить AI"}
          </span>
        </UiButton>
      ) : null}
      {panelOpen && settings ? (
        <UiSurface asChild appearance="flush">
          <aside
            id={panelId}
            aria-label="AI-ассистент"
            className={styles.panel}
            data-testid="realize-ai-panel"
            onKeyDown={onKeyDown}
            ref={panelRef}
            tabIndex={-1}
          >
            <ChatPanelResize rootRef={rootRef} panelId={panelId} />
            <ChatWorkspace
              variant="panel"
              settings={settings}
              onClose={closeChat}
              onOpenSettings={openSettings}
              onChangeDisplayMode={openChat}
            />
          </aside>
        </UiSurface>
      ) : null}
    </AdminUiTheme>
  );
};
