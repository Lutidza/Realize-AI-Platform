/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatWorkspace.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Связывает provider чата с единым представлением всех вариантов размещения.
 */

"use client";

import { useRealizeAIController } from "../RealizeAIContext";
import type { ChatWorkspaceProps } from "./ChatWorkspace.types";
import { ChatWorkspaceView } from "./ChatWorkspace.view";
import { useChatWorkspace } from "./useChatWorkspace.hook";

/** Заполняет область host без собственной маршрутизации или дополнительного controller. */
export const ChatWorkspace = (props: ChatWorkspaceProps) => {
  const controller = useRealizeAIController();
  const workspace = useChatWorkspace(controller, props);
  return (
    <ChatWorkspaceView
      {...props}
      controller={controller}
      workspace={workspace}
    />
  );
};
