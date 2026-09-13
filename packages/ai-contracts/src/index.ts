/**
 * @file packages/ai-contracts/src/index.ts
 * @version 1.13.0
 * @date 2026-09-12
 * @description Экспортирует стабильный публичный API контрактов Realize AI.
 */

export * from "./agent";
export * from "./aiConfiguration";
export * from "./aiConfigurationAPI";
export * from "./aiConfigurationInputValidation";
export type {
  AIChatConfigurationSelection,
  AIChatConfigurationSummary,
  AIChatConfigurationSnapshot,
  AIChatConfigurationCatalogDTO,
  AIChatConfigurationRenderValues,
} from "./AIChatConfiguration.types";
export { parseAIChatConfigurationSelection } from "./parseAIChatConfigurationSelection.validator";
export { parseAIChatConfigurationSnapshotShape } from "./parseAIChatConfigurationSnapshotShape.validator";
export * from "./api";
export type { ChangePlanReadinessDTO } from "./ChangePlanReadiness.types";
export * from "./capabilities";
export * from "./dataOperations";
export * from "./dataOperationValidation";
export type {
  CreatePageDraftIntent,
  PageDraftCreationOperationDTO,
  PageDraftCreationPreviewDTO,
  PageDraftCreationResultDTO,
  PageDraftSection,
} from "./PageDraftCreation.types";
export { parseCreatePageDraftIntent } from "./parseCreatePageDraftIntent.validator";
export type {
  PageDraftTextFieldDTO,
  PageDraftCatalogDTO,
  PageDraftContextDTO,
  PageDraftReference,
  PageDraftTextChange,
  UpdatePageDraftIntent,
  PageDraftUpdatePreviewDTO,
  PageDraftUpdateOperationDTO,
} from "./PageDraftUpdate.types";
export {
  parsePageDraftContext,
  parsePageDraftReference,
} from "./parsePageDraftContext.validator";
export {
  parseUpdatePageDraftIntent,
  parsePageDraftTextChanges,
} from "./parseUpdatePageDraftIntent.validator";
export * from "./events";
export * from "./execution";
export * from "./integrations";
export * from "./CodexIntegration.types";
export * from "./CodexAgentDiagnostics.types";
export * from "./WorkerAvailability.types";
export * from "./CodexChatSettings.types";
export * from "./codexChatSettings.config";
export * from "./parseCodexChatSettings.validator";
export * from "./parseCodexIntegration.validator";
export type { GitIntegrationTransport } from "./GitIntegrationTransport.types";
export type { GitCommitAuthor } from "./GitCommitAuthor.types";
export { parseGitCommitAuthor } from "./parseGitCommitAuthor.validator";
export {
  parseGitHubIntegrationConfiguration,
  parseGitIntegrationTransport,
} from "./parseGitHubIntegrationConfiguration.validator";
export * from "./preview";
export * from "./release";
export * from "./sourcePromotion";
export * from "./validation";
export * from "./workflows";
export * from "./WorkflowExecution.types";
export * from "./WorkflowRunRegistry.types";
export * from "./parseWorkflowRunQuery.validator";
export * from "./parseWorkflowExecutionInput.validator";
export * from "./parseWorkflowCheckpointShape.validator";
export * from "./parseWorkflowJSONValue.validator";

export * from "./ChatContext.types";
export * from "./chatContext.constants";
export * from "./parseChatMessageContext.validator";
export * from "./parseChatSources.validator";
export * from "./parseProjectFileReference.validator";

export * from "./normalizeChatAttachmentMime.validator";

export * from "./CodexAgentSettings.types";
export * from "./codexAgentSettings.config";
export * from "./parseCodexAgentSettings.validator";
