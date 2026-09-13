/**
 * @file packages/payload-ai-plugin/src/chat-context/ChatRunContext.types.ts
 * @version 1.2.0
 * @date 2026-09-12
 * @description Отделяет неизменяемый серверный контекст запуска от публичного контекста сообщения.
 */
import type {
  AIChatConfigurationSnapshot,
  WorkflowCheckpoint,
  PageDraftContextDTO,
} from "@realize/ai-contracts";
import type { ChatMessageContext } from "./ChatAttachment.types";

export type ChatRunContext = ChatMessageContext & {
  pageDraftContext?: PageDraftContextDTO;
  agentConfiguration?: AIChatConfigurationSnapshot;
  runtimeContextHash: string;
  conversationHistory?: string;
  workflow?: WorkflowCheckpoint;
  workflowSourceMessageID?: string;
};
