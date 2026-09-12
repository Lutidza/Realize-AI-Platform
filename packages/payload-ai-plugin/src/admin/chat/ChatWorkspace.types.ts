/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatWorkspace.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет границу внутреннего чата и обработчики его размещения.
 */

import type { CodexChatSettingsDto } from "@realize/ai-contracts";
import type { RealizeAIController } from "../RealizeAIContext";
import type { useChatWorkspace } from "./useChatWorkspace.hook";

/** Host задаёт размер, тему и размещение; workspace сохраняет единый controller. */
export type ChatWorkspaceProps = {
  variant: "panel" | "page" | "window";
  settings: CodexChatSettingsDto;
  onClose?: () => void;
  onOpenSettings?: () => void;
  onChangeDisplayMode?: (mode: "panel" | "page" | "window") => void;
};

export type ChatWorkspaceViewProps = ChatWorkspaceProps & {
  controller: RealizeAIController;
  workspace: ReturnType<typeof useChatWorkspace>;
};
