/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatConversation.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Связывает поведение ввода и прокрутки с представлением разговора.
 */

import type { ChatConversationProps } from "./ChatConversation.types";
import { ChatConversationView } from "./ChatConversation.view";
import { useChatConversation } from "./useChatConversation.hook";

export const ChatConversation = (props: ChatConversationProps) => {
  const conversation = useChatConversation(props);
  return <ChatConversationView {...props} {...conversation} />;
};
