/**
 * @file packages/payload-ai-plugin/src/constants.ts
 * @version 1.6.0
 * @date 2026-10-05
 * @description Хранит стабильные runtime/config collection и route identifiers plugin.
 */

import { USAGE_COLLECTION_SLUGS } from "./usage/usage.constants";

export const ANALYTICS_USAGE_ROUTE = "/analytics/ai" as const;

export const CONVERSATIONS_SLUG = "realize-ai-conversations" as const;
export const CHANGE_REQUESTS_SLUG = "realize-ai-change-requests" as const;
export const APPROVALS_SLUG = "realize-ai-approvals" as const;
export const MESSAGES_SLUG = "realize-ai-messages" as const;
export const RUNS_SLUG = "realize-ai-runs" as const;
export const RUN_EVENTS_SLUG = "realize-ai-run-events" as const;
export const EXECUTION_JOBS_SLUG = "realize-ai-execution-jobs" as const;
export const WORKER_PRESENCE_SLUG = "realize-ai-worker-presence" as const;
export const CHECK_RESULTS_SLUG = "realize-ai-check-results" as const;
export const DEPLOYMENTS_SLUG = "realize-ai-deployments" as const;
export const RELEASE_CANDIDATES_SLUG = "realize-ai-release-candidates" as const;
export const SOURCE_PROMOTIONS_SLUG = "realize-ai-source-promotions" as const;
export const INTEGRATIONS_SLUG = "realize-ai-integrations" as const;
export const INTEGRATION_EVENTS_SLUG = "realize-ai-integration-events" as const;
export const DATA_OPERATIONS_SLUG = "realize-ai-data-operations" as const;
export const DATA_OPERATION_APPROVALS_SLUG =
  "realize-ai-data-operation-approvals" as const;
export const DATA_OPERATION_EVENTS_SLUG =
  "realize-ai-data-operation-events" as const;
export const AI_CONFIG_DRAFTS_SLUG = "realize-ai-config-drafts" as const;
export const AI_CONFIG_RELEASES_SLUG = "realize-ai-config-releases" as const;
export const ACTIVE_AI_CONFIG_POINTERS_SLUG =
  "realize-ai-active-config-pointers" as const;
export const AI_CONFIG_EVENTS_SLUG = "realize-ai-config-events" as const;

export const AI_COLLECTION_SLUGS = [
  ...USAGE_COLLECTION_SLUGS,
  "realize-ai-search-observations",
  "realize-ai-search-state",
  CONVERSATIONS_SLUG,
  CHANGE_REQUESTS_SLUG,
  APPROVALS_SLUG,
  MESSAGES_SLUG,
  RUNS_SLUG,
  RUN_EVENTS_SLUG,
  EXECUTION_JOBS_SLUG,
  WORKER_PRESENCE_SLUG,
  CHECK_RESULTS_SLUG,
  DEPLOYMENTS_SLUG,
  RELEASE_CANDIDATES_SLUG,
  SOURCE_PROMOTIONS_SLUG,
  INTEGRATIONS_SLUG,
  INTEGRATION_EVENTS_SLUG,
  DATA_OPERATIONS_SLUG,
  DATA_OPERATION_APPROVALS_SLUG,
  DATA_OPERATION_EVENTS_SLUG,
  AI_CONFIG_DRAFTS_SLUG,
  AI_CONFIG_RELEASES_SLUG,
  ACTIVE_AI_CONFIG_POINTERS_SLUG,
  AI_CONFIG_EVENTS_SLUG,
] as const;

export const DEFAULT_ADMIN_ROUTE = "/ai";
export const DEFAULT_INTEGRATIONS_ROUTE = "/integrations";
export const DEFAULT_MCP_SERVERS_ROUTE = "/mcp-servers";
export const DEFAULT_API_ROUTE = "/realize-ai";
export const REALIZE_AI_SERVER_RUNTIME_KEY = "realizeAIControl" as const;

export const CHAT_ATTACHMENTS_SLUG = "realize-ai-chat-attachments" as const;
