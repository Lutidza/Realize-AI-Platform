/**
 * @file packages/payload-ai-plugin/src/chat-context/ChatRunContext.types.ts
 * @version 1.5.0
 * @date 2026-09-30
 * @description Отделяет исходный контекст и добавляемые сервером чтения запуска от публичного сообщения.
 */
import type {
  AIChatConfigurationSnapshot,
  WorkflowCheckpoint,
  PageDraftContextDTO,
  PageDiscoveryReadRecord,
  PageDiscoveryStructureReadRecord,
  RepositoryChatAccess,
} from "@realize/ai-contracts";
import type { ChatMessageContext } from "./ChatAttachment.types";
import type { PageDiscoveryCallRecord } from "./PageDiscovery.types";

export type ChatRunContext = ChatMessageContext & {
  repositoryAccess?: RepositoryChatAccess;
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
