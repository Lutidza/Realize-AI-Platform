/**
 * @file packages/payload-ai-plugin/src/chat-context/ChatRunContext.types.ts
 * @version 1.6.0
 * @date 2026-10-04
 * @description Отделяет исходный контекст и добавляемые сервером чтения запуска от публичного сообщения.
 */
import type {
  AIChatConfigurationSnapshot,
  SystemAIReleaseReference,
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
  systemRelease?: SystemAIReleaseReference;
  runtimeContextHash: string;
  conversationHistory?: string;
  workflow?: WorkflowCheckpoint;
  workflowSourceMessageID?: string;
};
