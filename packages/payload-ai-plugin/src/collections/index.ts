/**
 * @file packages/payload-ai-plugin/src/collections/index.ts
 * @version 2026-08-28
 * @description Компонует chat, source/release delivery и server-only integration collections.
 */

import type { CollectionConfig } from "payload";

import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createApprovalsCollection } from "./approvals";
import { createChangeRequestsCollection } from "./changeRequests";
import { createCheckResultsCollection } from "./checkResults";
import { createConversationsCollection } from "./conversations";
import { createDeploymentsCollection } from "./deployments";
import { createDataOperationApprovalsCollection } from "./dataOperationApprovals";
import { createDataOperationEventsCollection } from "./dataOperationEvents";
import { createDataOperationsCollection } from "./dataOperations";
import { createMessagesCollection } from "./messages";
import { createExecutionJobsCollection } from "./executionJobs";
import { createIntegrationEventsCollection } from "./integrationEvents";
import { createIntegrationsCollection } from "./integrations";
import { createRunEventsCollection } from "./runEvents";
import { createRunsCollection } from "./runs";
import { createReleaseCandidatesCollection } from "./releaseCandidates";
import { createSourcePromotionsCollection } from "./sourcePromotions";

export const createAICollections = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig[] => [
  createConversationsCollection(options),
  createMessagesCollection(options),
  createChangeRequestsCollection(options),
  createApprovalsCollection(options),
  createDataOperationsCollection(options),
  createDataOperationApprovalsCollection(options),
  createDataOperationEventsCollection(options),
  createExecutionJobsCollection(options),
  createDeploymentsCollection(options),
  createReleaseCandidatesCollection(options),
  createSourcePromotionsCollection(options),
  createIntegrationsCollection(options),
  createIntegrationEventsCollection(options),
  createCheckResultsCollection(options),
  createRunsCollection(options),
  createRunEventsCollection(options),
];
