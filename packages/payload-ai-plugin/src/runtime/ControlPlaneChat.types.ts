/**
 * @file packages/payload-ai-plugin/src/runtime/ControlPlaneChat.types.ts
 * @version 1.6.0
 * @date 2026-10-04
 * @description Описывает серверный запрос запуска с непрозрачными ссылками на контекст.
 */
import type {
  ChatAssetReference,
  ProjectFileReference,
  AIChatConfigurationSnapshot,
  SystemAIReleaseReference,
  WorkflowCheckpoint,
  PageDraftContextDTO,
  PageDiscoveryGrant,
  RepositoryChatAccess,
} from "@realize/ai-contracts";
export type StartControlPlaneRunInput = {
  repositoryAccess?: RepositoryChatAccess;
  /** Закрытый допуск callback; никогда не входит в prompt или browser DTO. */
  pageDiscovery?: PageDiscoveryGrant;
  pageDraftContext?: PageDraftContextDTO;
  agentConfiguration?: AIChatConfigurationSnapshot;
  systemRelease?: SystemAIReleaseReference;
  workflow?: WorkflowCheckpoint;
  conversationHistory?: string;
  model?: string;
  prompt: string;
  runID: string;
  threadID?: string;
  attachments?: ChatAssetReference[];
  projectFiles?: ProjectFileReference[];
  webSearch?: boolean;
};

export type ControlPlaneRunStatus =
  "queued" | "running" | "completed" | "failed" | "cancelled";
