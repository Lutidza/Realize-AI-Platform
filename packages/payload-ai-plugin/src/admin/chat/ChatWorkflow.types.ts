/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatWorkflow.types.ts
 * @version 1.0.1
 * @date 2026-09-11
 * @description Отделяет выбор процесса и безопасное продолжение от общего состояния чата.
 */

import type {
  ConversationDetailDTO,
  AIChatConfigurationSelection,
  CreateMessageInput,
  RunDTO,
} from "@realize/ai-contracts";
import type { Dispatch, SetStateAction } from "react";
import type { ChatReadyContext } from "./ChatDraftContext.types";
import type { ChatAgentConfigurationController } from "./ChatAgentConfiguration.types";
import type { RealizeAIController } from "../RealizeAIController.types";

export type { WorkflowContinuationResult as ChatWorkflowResult } from "./WorkflowContinuation.types";
import type { WorkflowContinuationResult } from "./WorkflowContinuation.types";

export type ChatWorkflowOptions = {
  configuration: ChatAgentConfigurationController;
  detail?: ConversationDetailDTO;
  currentRun?: RunDTO;
  enabled: boolean;
  ready: boolean;
  busy: boolean;
  draft: string;
  hasContext: boolean;
  setDraft: Dispatch<SetStateAction<string>>;
  setError: (error?: string) => void;
  acceptResult: (
    result: WorkflowContinuationResult,
    conversationID: string,
  ) => void;
  refreshConversation: (id: string) => Promise<ConversationDetailDTO>;
};

/** Повтор сохраняет точный запрос; переключение в обычный чат не удаляет checkpoint. */
export type ChatWorkflowController = {
  key: string;
  inputText: string;
  isSelectionReady: boolean;
  isPending: boolean;
  hasRetry: boolean;
  isRefreshing: boolean;
  isReplying: boolean;
  canContinue: boolean;
  run?: RunDTO;
  runs: RunDTO[];
  error?: string;
  pendingConversationID?: string;
  select: (key: string) => void;
  selectRun: (id: string) => void;
  setInputText: (value: string) => void;
  setReplying: (value: boolean) => void;
  readStart: () => CreateMessageInput["workflow"];
  clearSentSelection: () => void;
  readDraft: () => ChatWorkflowDraft;
  restoreDraft: (draft?: ChatWorkflowDraft) => void;
  continue: () => Promise<void>;
  refresh: () => Promise<void>;
};

export type ChatWorkflowSelectionProps = {
  controller: RealizeAIController;
  disabled: boolean;
};
export type ChatWorkflowProgressProps = { workflow: ChatWorkflowController };

/** Неизвестный результат первого POST повторяется с исходным текстом, контекстом и ключом. */
export type ChatWorkflowStartRequest = {
  conversationID: string;
  body: string;
  key: string;
  draft: string;
  snapshot: ChatReadyContext;
};

/** Публичный межоконный черновик: точный профиль, выбор процесса и незавершённый JSON. */
export type ChatWorkflowDraft = {
  key: string;
  inputText: string;
  profile?: AIChatConfigurationSelection;
};
