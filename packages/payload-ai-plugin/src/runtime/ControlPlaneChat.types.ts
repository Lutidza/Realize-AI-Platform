/**
 * @file packages/payload-ai-plugin/src/runtime/ControlPlaneChat.types.ts
 * @version 1.2.0
 * @date 2026-09-11
 * @description Описывает серверный запрос запуска с непрозрачными ссылками на контекст.
 */
import type {
  ChatAssetReference,
  ProjectFileReference,
  AIChatConfigurationSnapshot,
  WorkflowCheckpoint,
} from "@realize/ai-contracts";
export type StartControlPlaneRunInput = {
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
