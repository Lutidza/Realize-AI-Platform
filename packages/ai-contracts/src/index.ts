/**
 * @file packages/ai-contracts/src/index.ts
 * @version 2.18.0
 * @date 2026-11-25
 * @description Экспортирует стабильный публичный API контрактов Realize AI.
 */

export * from "./agent";
export { adapterAccessEvidenceV1Schema } from "./assignmentAccessEvidence.schemas";
export type { AdapterAccessEvidenceV1 } from "./AdapterAccessEvidence.types";
export * from "./OwnerEngineering.types";
export * from "./ownerEngineering.constants";
export { encodeOwnerEngineeringGrant } from "./ownerEngineeringGrant.util";
export type {
  UsageContext,
  UsageTokens,
  UsagePrice,
  UsageObservation,
  UsageBudgetPolicy,
  UsageQuery,
  UsageReconciliation,
  UsageCostBasis,
  UsageCost,
  UsageAttempt,
  UsageAttemptInput,
  UsageReservation,
  UsageBudgetReadiness,
  ProviderUsageMeasurement,
} from "./usage/UsageLedger.types";
export {
  usageNanosSchema,
  usageCurrencySchema,
  usageTokensSchema,
  usageContextSchema,
  usagePriceSchema,
  usageObservationSchema,
  usageBudgetPolicySchema,
  usageReconciliationSchema,
  usageAbandonSchema,
  usageQuerySchema,
} from "./usage/usageLedger.schemas";
export type { InstalledSearchBuildDTO } from "./InstalledSearchBuild.types";
export { mcpToolInputs } from "./mcpToolInputs.config";
export { mcpToolDataSchemas } from "./mcpToolOutputs.config";
export type * from "./DesignWorkshop.types";
export type * from "./DesignWorkspace.types";
export {
  designWorkspacePinSchema,
  designWorkspaceSourceSchema,
  designWorkspaceManifestSchema,
  designWorkspaceReceiptSchema,
} from "./designWorkspace.schemas";
export { DESIGN_WORKSHOP_LIMITS } from "./designWorkshop.constants";
export {
  designWorkshopCommands,
  designSnapshotSchema,
  designMutationReceiptSchema,
} from "./designWorkshop.schemas";
export type {
  McpChatGptConfiguration,
  McpChatGptConnectionDto,
  McpChatGptStatus,
  McpChatGptObservation,
  SaveMcpChatGptInput,
} from "./McpChatGpt.types";
export type {
  McpServerType,
  McpManagementSource,
  McpDirection,
  McpClientGrants,
  McpLimits,
  McpHostedConfiguration,
  McpHttpConfiguration,
  McpMetadataConfiguration,
  McpServerConfiguration,
  McpActionDto,
  McpServerActionsDto,
  McpServerDescriptorDto,
  McpHostProfileDto,
  McpObservedStateDto,
  McpServerSummaryDto,
  McpClientDto,
  McpDiscoveredToolDto,
  McpServerDetailDto,
  McpServerListDto,
  McpServerListQuery,
  CreateMcpServerInput,
  McpServerPreset,
  McpServerPresetDto,
  McpInstallPresetsDto,
  UpdateMcpServerInput,
  McpRevisionInput,
  SetMcpServerEnabledInput,
  IssueMcpClientInput,
  McpOneTimeTokenDto,
  McpServerMutationDto,
  McpProbeResultDto,
  McpApplyResultDto,
  McpAuditEventDto,
  McpAuditListDto,
} from "./McpServer.types";
export {
  MCP_REALIZE_TOOLS,
  MCP_DEFAULT_LIMITS,
  MCP_SERVER_DESCRIPTORS,
} from "./mcpServer.config";
export { MCP_SERVER_PRESETS } from "./mcpServerPresets.config";
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
export type {
  PageArtifactManifest,
  PageArtifactDefinitionDTO,
  PageArtifactCatalogDTO,
  PageBlockOutlineDTO,
  PageOutlineDTO,
  PageKnowledgeDTO,
  PageStructureContextDTO,
} from "./PageKnowledge.types";
export { parsePageArtifactCatalog } from "./parsePageArtifactCatalog.validator";
export {
  parsePageKnowledge,
  parsePageStructureContext,
} from "./parsePageKnowledge.validator";
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
export * from "./designPreview.constants";
export * from "./designPreview.schemas";
export * from "./DesignPreview.types";
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
export type * from "./CodexModelCatalog.types";
export { parseCodexModelPage } from "./parseCodexModels.validator";
export * from "./codexAgentSettings.config";
export * from "./parseCodexAgentSettings.validator";

export type {
  AgentReadToolDefinition,
  AgentReadTools,
} from "./AgentReadTool.types";
export type {
  PageDiscoveryCall,
  PageDiscoveryGrant,
  PageDiscoverySearchDTO,
  PageDiscoveryReadRecord,
  PageDiscoveryResult,
} from "./PageDiscovery.types";
export {
  parsePageDiscoveryCall,
  parsePageDiscoveryGrant,
  parsePageDiscoverySearch,
  parsePageDiscoveryResult,
} from "./parsePageDiscovery.validator";

export type {
  UpdatePageStructureDraftIntent,
  PageDraftStructureCommand,
  PageDraftContentPreviewDTO,
  PageDraftStructurePreviewDTO,
  PageDraftStructureOperationDTO,
} from "./PageDraftStructure.types";
export {
  parseUpdatePageStructureDraftIntent,
  parsePageDraftContentPreview,
  parsePageDraftStructurePreview,
} from "./parsePageDraftStructure.validator";

export type { PageDiscoveryStructureReadRecord } from "./PageDiscovery.types";
export type {
  PreparePagePublicationInput,
  PagePublicationCheckDTO,
  PreparePagePublicationRestoreInput,
  PagePublicationReviewInput,
  PagePublicationReviewEvidenceDTO,
  PagePublicationStateDTO,
  PagePublicationPreviewDTO,
  PagePublicationDeliveryDTO,
  PagePublicationResultDTO,
  PagePublicationOperationDTO,
  PagePublicationRestoreOperationDTO,
} from "./PagePublication.types";
export {
  parsePagePublicationChecks,
  parsePagePublicationReview,
  parsePagePublicationEvidence,
  parsePagePublicationPreview,
} from "./parsePagePublication.validator";

export * from "./mcpWorkshop.config";
export * from "./mcpWorkshop.schemas";
export type * from "./McpWorkshop.types";
export {
  searchObservationSchema,
  searchObservationQuerySchema,
} from "./searchObservation.schemas";
export type {
  SearchObservation,
  SearchObservationPage,
  SearchObservationQuery,
} from "./SearchObservation.types";
export * from "./searchObservationManagement.constants";
export type * from "./SearchObservationAnalytics.types";
export * from "./searchObservationManagement.schemas";
export type * from "./SearchObservationManagement.types";
export * from "./searchQuality.schemas";
export type * from "./SearchQuality.types";

export type {
  SystemAIRelease,
  SystemAIReleaseReference,
  AIExecutionContextSnapshot,
} from "./SystemAIRelease.types";

export type {
  UsageAmountDto,
  UsageCostDto,
  UsageAttemptDto,
  PlatformUsageAttemptDto,
  UsageGroupDto,
  UsageFilterOptionsDto,
  UsagePeriodMetricsDto,
  UsageAnalyticsDto,
  UsageDashboardDto,
  PlatformUsageDashboardDto,
} from "./usage/UsageDashboard.types";
export { usageGroupKeys } from "./usage/usageGrouping.config";
