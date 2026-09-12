/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatConversation.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет вход разговора и состояние его представления.
 */

import type { CodexChatSettingsDto } from "@realize/ai-contracts";
import type { RealizeAIController } from "../RealizeAIContext";
import type { useChatConversation } from "./useChatConversation.hook";

export type ChatConversationProps = {
  controller: RealizeAIController;
  settings: CodexChatSettingsDto;
};

export type ChatConversationViewProps = ChatConversationProps &
  ReturnType<typeof useChatConversation>;
