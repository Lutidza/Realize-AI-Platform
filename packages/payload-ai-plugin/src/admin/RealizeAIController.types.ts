/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAIController.types.ts
 * @version 1.5.0
 * @date 2026-09-14
 * @description Задаёт общий controller сообщений, истории и управляемых действий чата.
 */

import type {
  ChangeRequestDTO,
  ConversationDTO,
  ConversationDetailDTO,
  DataOperationDTO,
  PagePublicationReviewInput,
  RunDTO,
  RuntimeStatusDTO,
} from "@realize/ai-contracts";

import type { ChatDraftContextController } from "./chat/ChatDraftContext.types";
import type { ChatAgentConfigurationController } from "./chat/ChatAgentConfiguration.types";

import type { ChatWorkflowController } from "./chat/ChatWorkflow.types";

import type { RunStreamState } from "./runStreamTypes";
import type { DataOperationStaleMarker } from "./DataOperationActions.types";

/** Единое состояние чата и управляемые действия, принадлежащие Admin provider. */
export type RealizeAIController = {
  agentConfiguration: ChatAgentConfigurationController;
  workflow: ChatWorkflowController;
  context: ChatDraftContextController;
  archiveConversation: (id: string) => Promise<void>;
  clearConversationSelection: () => void;
  cancel: () => Promise<void>;
  clearError: () => void;
  conversations: ConversationDTO[];
  applyDataOperation: (operation: DataOperationDTO) => Promise<void>;
  approveDataRollback: (operation: DataOperationDTO) => Promise<void>;
  createChangeRequest: (messageID: string) => Promise<void>;
  createDataOperation: (messageID: string) => Promise<void>;
  dataOperationStaleMarkers: Record<string, DataOperationStaleMarker>;
  preparePagePublication: (operation: DataOperationDTO) => Promise<void>;
  preparePublicationRestore: (operation: DataOperationDTO) => Promise<void>;
  retryPublicationDelivery: (operation: DataOperationDTO) => Promise<void>;
  currentRun?: RunDTO;
  decideChangeRequest: (
    change: ChangeRequestDTO,
    decision: "approve" | "reject",
    comment?: string,
  ) => Promise<void>;
  decideImplementation: (
    change: ChangeRequestDTO,
    decision: "approve" | "reject",
    comment?: string,
  ) => Promise<void>;
  decideDataOperation: (
    operation: DataOperationDTO,
    decision: "approve" | "reject",
    comment?: string,
    previewReview?: PagePublicationReviewInput,
  ) => Promise<void>;
  decidePreview: (
    change: ChangeRequestDTO,
    decision: "approve" | "reject",
    comment?: string,
  ) => Promise<void>;
  decideRelease: (
    change: ChangeRequestDTO,
    decision: "approve" | "reject",
    comment?: string,
  ) => Promise<void>;
  detail?: ConversationDetailDTO;
  draft: string;
  error?: string;
  isCreatingConversation: boolean;
  isPlanActionPending?: string;
  isSubmitting: boolean;
  pendingWorkflowConversationID?: string;
  executeChangeRequest: (change: ChangeRequestDTO) => Promise<void>;
  deployPreview: (change: ChangeRequestDTO) => Promise<void>;
  prepareRelease: (change: ChangeRequestDTO) => Promise<void>;
  publishPullRequest: (change: ChangeRequestDTO) => Promise<void>;
  rollbackDataOperation: (operation: DataOperationDTO) => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  ready: boolean;
  runtime?: RuntimeStatusDTO;
  search: string;
  selectedConversationID?: string;
  send: () => Promise<void>;
  setDraft: (value: string) => void;
  setSearch: (value: string) => void;
  startConversation: () => Promise<void>;
  stream: RunStreamState;
};
