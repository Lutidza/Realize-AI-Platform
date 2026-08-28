/**
 * @file packages/ai-contracts/src/api.ts
 * @version 2026-08-28
 * @description Задаёт public API envelopes для чата, изменений, source promotion и integrations.
 */

import type {
  ChangeExecutionDTO,
  ImplementationAcceptanceDTO,
} from "./execution";
import type { ChangePreviewDTO } from "./preview";
import type { ChangeReleaseDTO } from "./release";
import type { ChangeSourcePromotionDTO } from "./sourcePromotion";
import type { DataOperationDTO } from "./dataOperations";

/** Stable machine-readable errors returned by the site API. */
export type APIErrorCode =
  | "AI_DISABLED"
  | "AI_RUNTIME_UNAVAILABLE"
  | "CONFLICT"
  | "FORBIDDEN"
  | "INTEGRATION_UNAVAILABLE"
  | "INTERNAL_ERROR"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UNAUTHENTICATED";

/** Public error payload; internal stack traces and raw provider errors are excluded. */
export type APIError = {
  code: APIErrorCode;
  details?: Record<string, unknown>;
  message: string;
};

/** Discriminated response envelope used by every JSON endpoint in this slice. */
export type APIResponse<T> =
  | {
      correlationID: string;
      data: T;
      ok: true;
    }
  | {
      correlationID: string;
      error: APIError;
      ok: false;
    };

/** Durable conversation lifecycle visible to the browser. */
export type ConversationStatus = "active" | "archived";
/** Allowed authors of a persisted public message. */
export type MessageRole = "assistant" | "system" | "user";
/** Rendering-safe classification of a persisted message. */
export type MessageKind =
  "assistant_message" | "system_error" | "usage_notice" | "user_message";
/** Site projection of the control-plane run lifecycle. */
export type RunStatus =
  "cancelled" | "completed" | "failed" | "queued" | "running";

/** Change categories defined by the Change Engine specification. */
export type ChangeRequestType =
  | "AGENCY_ENGINEERING_REQUEST"
  | "CATALOG_CHANGE"
  | "CODE_CHANGE"
  | "CONFIG_CHANGE"
  | "CONTENT_CHANGE"
  | "DEPLOYMENT_ONLY"
  | "MIXED_CHANGE"
  | "QUERY"
  | "ROLLBACK"
  | "SCHEMA_CHANGE"
  | "THEME_CHANGE";

/** Risk tier attached to a plan before any approval is accepted. */
export type ChangeRiskLevel = "R0" | "R1" | "R2" | "R3" | "R4";

/** Управляемые plan, execution, preview и release states для browser API. */
export type ChangeRequestState =
  | "awaiting_plan_approval"
  | "blocked"
  | "changes_accepted"
  | "changes_ready"
  | "executing"
  | "execution_queued"
  | "plan_approved"
  | "preview_accepted"
  | "preview_committing"
  | "preview_failed"
  | "preview_preparing"
  | "preview_queued"
  | "preview_ready"
  | "preview_reviewing"
  | "preview_starting"
  | "preview_validating"
  | "release_approved"
  | "release_failed"
  | "release_preparing"
  | "awaiting_release_approval"
  | "validating"
  | "validation_failed"
  | "workspace_preparing";

/** Immutable decision recorded against one exact plan and scope version. */
export type PlanApprovalDTO = {
  actorRole: string;
  boundHash: string;
  comment?: string;
  createdAt: string;
  decision: "approved" | "rejected";
  expiresAt: string;
  id: string;
};

/** Browser-safe проекция durable approval-gated Change Request. */
export type ChangeRequestDTO = {
  acceptance?: ImplementationAcceptanceDTO;
  affectedPaths: string[];
  approval?: PlanApprovalDTO;
  blockedReason?: string;
  checks: string[];
  conversationID: string;
  createdAt: string;
  execution: ChangeExecutionDTO;
  expiresAt: string;
  id: string;
  normalizedIntent: string;
  originalRequest: string;
  plan: string;
  planHash: string;
  preview: ChangePreviewDTO;
  release: ChangeReleaseDTO;
  riskLevel: ChangeRiskLevel;
  scopeHash: string;
  sourcePromotion: ChangeSourcePromotionDTO;
  sourceMessageID: string;
  state: ChangeRequestState;
  title: string;
  type: ChangeRequestType;
  updatedAt: string;
  version: number;
};

/** Provider-neutral token counters stored without pricing assumptions. */
export type UsageSummary = {
  cachedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

/** List/detail projection of conversation metadata. */
export type ConversationDTO = {
  createdAt: string;
  id: string;
  lastMessageAt: string;
  status: ConversationStatus;
  title: string;
  updatedAt: string;
};

/** Redacted, user-visible message projection. */
export type MessageDTO = {
  content: string;
  conversationID: string;
  createdAt: string;
  dataOperationIntentAvailable: boolean;
  id: string;
  kind: MessageKind;
  role: MessageRole;
  runID?: string;
  sequence: number;
  usage?: UsageSummary;
};

/** Auditable read-only run projection exposed to an authorized admin. */
export type RunDTO = {
  conversationID: string;
  createdAt: string;
  errorSummary?: string;
  finishedAt?: string;
  id: string;
  model?: string;
  provider: "openai-codex";
  sandboxProfile: "analysis-readonly";
  startedAt?: string;
  status: RunStatus;
  threadID?: string;
  updatedAt: string;
  usage?: UsageSummary;
};

/** Aggregate returned when opening one conversation. */
export type ConversationDetailDTO = {
  changeRequests: ChangeRequestDTO[];
  conversation: ConversationDTO;
  dataOperations: DataOperationDTO[];
  messages: MessageDTO[];
  runs: RunDTO[];
};

/** Explicit runtime availability state shown by the Admin UI. */
export type RuntimeStatusDTO = {
  enabled: boolean;
  mode: "central-control-plane" | "local-development";
  reason?: string;
  state: "disabled" | "ready" | "unavailable";
};

/** Validated payload accepted when creating a conversation. */
export type CreateConversationInput = {
  title?: string;
};

/** Validated payload accepted when starting a message run. */
export type CreateMessageInput = {
  content: string;
};

/** Promotes one persisted assistant response into a bounded plan snapshot. */
export type CreateChangeRequestInput = {
  sourceMessageID: string;
};

/** Optimistic-lock payload accepted when approving an exact plan version. */
export type ApprovePlanInput = {
  comment?: string;
  expectedVersion: number;
};

/** Optimistic-lock payload accepted when rejecting an exact plan version. */
export type RejectPlanInput = {
  comment: string;
  expectedVersion: number;
};
