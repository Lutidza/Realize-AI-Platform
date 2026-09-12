/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAIClient.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Размещает общий workspace на странице Admin или в отдельном окне.
 */

"use client";

import { ChatWorkspace } from "./chat/ChatWorkspace.component";
import { UiButton, UiNotice } from "@realize/ui-kit";
import { AdminUiTheme } from "./AdminUiTheme.component";
import type { RealizeAIClientProps } from "./chat-presentation/ChatPresentation.types";
import { useChatPresentation } from "./chat-presentation/useChatPresentation.hook";
import styles from "./chat-presentation/ChatHost.module.css";

/** Оба маршрута используют settings и controller общего Admin provider. */
export const RealizeAIClient = ({
  presentation = "page",
}: RealizeAIClientProps) => {
  const host = useChatPresentation();
  if (!host?.settings)
    return (
      <AdminUiTheme>
        <div className={styles.loading} role="status">
          <p>{host?.error || "Загрузка чата…"}</p>
          {host?.error ? (
            <UiButton onClick={() => void host.refreshSettings()}>
              Повторить
            </UiButton>
          ) : null}
        </div>
      </AdminUiTheme>
    );
  return (
    <AdminUiTheme>
      <div className={presentation === "window" ? styles.window : styles.page}>
        {host.notice || host.error ? (
          <UiNotice role="alert" tone="danger">
            {host.notice || host.error}
          </UiNotice>
        ) : null}
        <div className={styles.content}>
          <ChatWorkspace
            variant={presentation}
            settings={host.settings}
            onClose={host.closeChat}
            onOpenSettings={host.openSettings}
            onChangeDisplayMode={host.openChat}
          />
        </div>
      </div>
    </AdminUiTheme>
  );
};
