/**
 * @file packages/payload-ai-plugin/src/collections/index.ts
 * @version 1.7.0
 * @date 2026-10-05
 * @description Компонует runtime, integration и installation config collections.
 */

import type { CollectionConfig } from "payload";
import { createUsageCollections } from "../usage/usageCollections.config";
import { createSearchObservationsCollection } from "./SearchObservations.collection";
import { createSearchObservationStateCollection } from "./SearchObservationState.collection";

import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createActiveAIConfigPointersCollection } from "./activeAIConfigPointers";
import { createAIConfigDraftsCollection } from "./aiConfigDrafts";
import { createAIConfigEventsCollection } from "./aiConfigEvents";
import { createAIConfigReleasesCollection } from "./aiConfigReleases";
import { createApprovalsCollection } from "./approvals";
import { createChangeRequestsCollection } from "./changeRequests";
import { createCheckResultsCollection } from "./checkResults";
import { createConversationsCollection } from "./conversations";
import { createDeploymentsCollection } from "./deployments";
import { createDataOperationApprovalsCollection } from "./dataOperationApprovals";
import { createDataOperationEventsCollection } from "./dataOperationEvents";
import { createDataOperationsCollection } from "./dataOperations";
import { createChatAttachmentsCollection } from "./chatAttachments.collection";
import { createMessagesCollection } from "./messages";
import { createExecutionJobsCollection } from "./executionJobs";
import { createIntegrationEventsCollection } from "./integrationEvents";
import { createIntegrationsCollection } from "./integrations";
import { createMcpClientsCollection } from "./McpClients.collection";
import { createMcpRuntimeReceiptsCollection } from "./McpRuntimeReceipts.collection";
import { createRunEventsCollection } from "./runEvents";
import { createWorkerPresenceCollection } from "./workerPresence.collection";
import { createRunsCollection } from "./runs";
import { createReleaseCandidatesCollection } from "./releaseCandidates";
import { createSourcePromotionsCollection } from "./sourcePromotions";
import { createDesignProjectsCollection } from "./DesignProjects.collection";
import { createDesignRevisionsCollection } from "./DesignRevisions.collection";
import { createDesignChangesCollection } from "./DesignChanges.collection";
import { createDesignOperationsCollection } from "./DesignOperations.collection";
import { createDesignPreviewJobsCollection } from "./DesignPreviewJobs.collection";

export const createAICollections = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig[] => [
  ...createUsageCollections(options),
  createSearchObservationsCollection(options),
  createSearchObservationStateCollection(options),
  createDesignProjectsCollection(options),
  createDesignRevisionsCollection(options),
  createDesignChangesCollection(options),
  createDesignOperationsCollection(options),
  createDesignPreviewJobsCollection(options),
  createConversationsCollection(options),
  createMessagesCollection(options),
  createChatAttachmentsCollection(options),
  createChangeRequestsCollection(options),
  createApprovalsCollection(options),
  createDataOperationsCollection(options),
  createDataOperationApprovalsCollection(options),
  createDataOperationEventsCollection(options),
  createAIConfigDraftsCollection(options),
  createAIConfigReleasesCollection(options),
  createActiveAIConfigPointersCollection(options),
  createAIConfigEventsCollection(options),
  createExecutionJobsCollection(options),
  createWorkerPresenceCollection(options),
  createDeploymentsCollection(options),
  createReleaseCandidatesCollection(options),
  createSourcePromotionsCollection(options),
  createIntegrationsCollection(options),
  createIntegrationEventsCollection(options),
  createMcpClientsCollection(options),
  createMcpRuntimeReceiptsCollection(options),
  createCheckResultsCollection(options),
  createRunsCollection(options),
  createRunEventsCollection(options),
];
