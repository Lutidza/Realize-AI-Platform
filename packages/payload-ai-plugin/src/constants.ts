/**
 * @file packages/payload-ai-plugin/src/constants.ts
 * @version 2026-08-27
 * @description Хранит стабильные collection и route identifiers Payload AI plugin.
 */

export const CONVERSATIONS_SLUG = "realize-ai-conversations" as const;
export const CHANGE_REQUESTS_SLUG = "realize-ai-change-requests" as const;
export const APPROVALS_SLUG = "realize-ai-approvals" as const;
export const MESSAGES_SLUG = "realize-ai-messages" as const;
export const RUNS_SLUG = "realize-ai-runs" as const;
export const RUN_EVENTS_SLUG = "realize-ai-run-events" as const;
export const EXECUTION_JOBS_SLUG = "realize-ai-execution-jobs" as const;
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

export const AI_COLLECTION_SLUGS = [
  CONVERSATIONS_SLUG,
  CHANGE_REQUESTS_SLUG,
  APPROVALS_SLUG,
  MESSAGES_SLUG,
  RUNS_SLUG,
  RUN_EVENTS_SLUG,
  EXECUTION_JOBS_SLUG,
  CHECK_RESULTS_SLUG,
  DEPLOYMENTS_SLUG,
  RELEASE_CANDIDATES_SLUG,
  SOURCE_PROMOTIONS_SLUG,
  INTEGRATIONS_SLUG,
  INTEGRATION_EVENTS_SLUG,
  DATA_OPERATIONS_SLUG,
  DATA_OPERATION_APPROVALS_SLUG,
  DATA_OPERATION_EVENTS_SLUG,
] as const;

export const DEFAULT_ADMIN_ROUTE = "/ai";
export const DEFAULT_INTEGRATIONS_ROUTE = "/integrations";
export const DEFAULT_API_ROUTE = "/realize-ai";
export const REALIZE_AI_SERVER_RUNTIME_KEY = "realizeAIControl" as const;
