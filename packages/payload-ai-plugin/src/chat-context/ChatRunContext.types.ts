/**
 * @file packages/payload-ai-plugin/src/chat-context/ChatRunContext.types.ts
 * @version 1.4.0
 * @date 2026-09-13
 * @description Отделяет исходный контекст и добавляемые сервером чтения запуска от публичного сообщения.
 */
import type {
  AIChatConfigurationSnapshot,
  WorkflowCheckpoint,
  PageDraftContextDTO,
  PageDiscoveryReadRecord,
  PageDiscoveryStructureReadRecord,
} from "@realize/ai-contracts";
import type { ChatMessageContext } from "./ChatAttachment.types";
import type { PageDiscoveryCallRecord } from "./PageDiscovery.types";

export type ChatRunContext = ChatMessageContext & {
  pageDraftContext?: PageDraftContextDTO;
  pageDiscoveryEnabled?: boolean;
  pageDiscoveryCalls?: PageDiscoveryCallRecord[];
  pageReadContexts?: PageDiscoveryReadRecord[];
  pageStructureReadContexts?: PageDiscoveryStructureReadRecord[];
  agentConfiguration?: AIChatConfigurationSnapshot;
  runtimeContextHash: string;
  conversationHistory?: string;
  workflow?: WorkflowCheckpoint;
  workflowSourceMessageID?: string;
};
