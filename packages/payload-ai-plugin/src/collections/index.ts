/**
 * @file packages/payload-ai-plugin/src/collections/index.ts
 * @version 2026-08-21
 * @description Composes chat, approval, execution and preview collections.
 */

import type { CollectionConfig } from "payload";

import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createApprovalsCollection } from "./approvals";
import { createChangeRequestsCollection } from "./changeRequests";
import { createCheckResultsCollection } from "./checkResults";
import { createConversationsCollection } from "./conversations";
import { createDeploymentsCollection } from "./deployments";
import { createMessagesCollection } from "./messages";
import { createExecutionJobsCollection } from "./executionJobs";
import { createRunEventsCollection } from "./runEvents";
import { createRunsCollection } from "./runs";

export const createAICollections = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig[] => [
  createConversationsCollection(options),
  createMessagesCollection(options),
  createChangeRequestsCollection(options),
  createApprovalsCollection(options),
  createExecutionJobsCollection(options),
  createDeploymentsCollection(options),
  createCheckResultsCollection(options),
  createRunsCollection(options),
  createRunEventsCollection(options),
];
