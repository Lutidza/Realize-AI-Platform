/**
 * @file packages/payload-ai-plugin/src/chat-context/ChatRunContext.types.ts
 * @version 1.7.0
 * @date 2026-10-23
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
  OwnerEngineeringRunMetadata,
} from "@realize/ai-contracts";
import type { ChatMessageContext } from "./ChatAttachment.types";
import type { PageDiscoveryCallRecord } from "./PageDiscovery.types";

export type ChatRunContext = ChatMessageContext & {
  ownerEngineering?: OwnerEngineeringRunMetadata;
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
