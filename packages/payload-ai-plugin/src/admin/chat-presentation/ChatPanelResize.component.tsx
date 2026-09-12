/**
 * @file packages/payload-ai-plugin/src/admin/chat-presentation/ChatPanelResize.component.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Подключает общий край UI-кита к размерам правой панели чата.
 */

"use client";

import { UiResizeHandle } from "@realize/ui-kit";
import type { ChatPanelResizeProps } from "./ChatPanel.types";
import { useChatPanelResize } from "./useChatPanelResize.hook";
import styles from "./ChatHost.module.css";

export const ChatPanelResize = ({ rootRef, panelId }: ChatPanelResizeProps) => {
  const resize = useChatPanelResize({ rootRef });
  return (
    <UiResizeHandle
      {...resize}
      controls={panelId}
      label="Изменить ширину чата"
      className={styles.resizeHandle}
      title="Потяните край или используйте стрелки. Двойной щелчок — исходная ширина."
    />
  );
};
