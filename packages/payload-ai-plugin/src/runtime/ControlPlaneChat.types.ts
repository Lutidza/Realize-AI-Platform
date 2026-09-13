/**
 * @file packages/payload-ai-plugin/src/runtime/ControlPlaneChat.types.ts
 * @version 1.3.0
 * @date 2026-09-12
 * @description Описывает серверный запрос запуска с непрозрачными ссылками на контекст.
 */
import type {
  ChatAssetReference,
  ProjectFileReference,
  AIChatConfigurationSnapshot,
  WorkflowCheckpoint,
  PageDraftContextDTO,
} from "@realize/ai-contracts";
export type StartControlPlaneRunInput = {
  pageDraftContext?: PageDraftContextDTO;
  agentConfiguration?: AIChatConfigurationSnapshot;
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
