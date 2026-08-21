/**
 * @file packages/payload-ai-plugin/src/endpoints/mappers.ts
 * @version 2026-08-21
 * @description Maps internal Payload records to explicit public DTOs.
 */

import type {
  AIStreamEvent,
  ChangeRequestDTO,
  ChangeRequestState,
  ChangeRequestType,
  ChangeRiskLevel,
  ConversationDTO,
  MessageDTO,
  MessageKind,
  MessageRole,
  RunDTO,
  RunStatus,
  PlanApprovalDTO,
  ExecutionCheckDTO,
  ExecutionDiffStatDTO,
  ExecutionJobDTO,
  ExecutionJobStatus,
  ExecutionStage,
  ImplementationAcceptanceDTO,
  IndependentReviewFindingDTO,
  PreviewAcceptanceDTO,
  PreviewDeploymentDTO,
  PreviewDeploymentStage,
  PreviewDeploymentStatus,
  UsageSummary,
} from "@realize/ai-contracts";

type Document = Record<string, unknown> & {
  createdAt?: string;
  id: number | string;
  updatedAt?: string;
};

export const relationID = (value: unknown): string => {
  if (typeof value === "number" || typeof value === "string")
    return String(value);
  if (value && typeof value === "object" && "id" in value) {
    return String((value as { id: number | string }).id);
  }
  return "";
};

const iso = (value: unknown): string => {
  return typeof value === "string" ? value : new Date(0).toISOString();
};

const usage = (value: unknown): UsageSummary | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  return {
    cachedInputTokens: Number(source.cachedInputTokens || 0),
    inputTokens: Number(source.inputTokens || 0),
    outputTokens: Number(source.outputTokens || 0),
    totalTokens: Number(source.totalTokens || 0),
  };
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

/** Maps an append-only approval without exposing the raw Payload user. */
export const toPlanApprovalDTO = (doc: Document): PlanApprovalDTO => ({
  actorRole: stringArray(doc.roleSnapshot)[0] || "authorized-user",
  boundHash: typeof doc.boundHash === "string" ? doc.boundHash : "",
  comment: typeof doc.comment === "string" ? doc.comment : undefined,
  createdAt: iso(doc.createdAt),
  decision: doc.decision === "rejected" ? "rejected" : "approved",
  expiresAt: iso(doc.expiresAt),
  id: String(doc.id),
});

/** Maps an implementation decision without exposing the raw actor record. */
export const toImplementationAcceptanceDTO = (
  doc: Document,
): ImplementationAcceptanceDTO => ({
  actorRole: stringArray(doc.roleSnapshot)[0] || "authorized-user",
  boundHash: typeof doc.boundHash === "string" ? doc.boundHash : "",
  comment: typeof doc.comment === "string" ? doc.comment : undefined,
  createdAt: iso(doc.createdAt),
  decision: doc.decision === "rejected" ? "rejected" : "approved",
  diffHash: typeof doc.diffHash === "string" ? doc.diffHash : "",
  expiresAt: iso(doc.expiresAt),
  id: String(doc.id),
});

/** Maps a preview decision without exposing the raw actor or internal runtime. */
export const toPreviewAcceptanceDTO = (
  doc: Document,
): PreviewAcceptanceDTO => ({
  actorRole: stringArray(doc.roleSnapshot)[0] || "authorized-user",
  artifactHash: typeof doc.artifactHash === "string" ? doc.artifactHash : "",
  boundHash: typeof doc.boundHash === "string" ? doc.boundHash : "",
  comment: typeof doc.comment === "string" ? doc.comment : undefined,
  createdAt: iso(doc.createdAt),
  decision: doc.decision === "rejected" ? "rejected" : "approved",
  environment: "local-preview",
  expiresAt: iso(doc.expiresAt),
  id: String(doc.id),
});

/** Maps one append-only verification result to a bounded DTO. */
export const toExecutionCheckDTO = (doc: Document): ExecutionCheckDTO => ({
  command: typeof doc.command === "string" ? doc.command : "",
  durationMs: Number(doc.durationMs || 0),
  evidenceHash: typeof doc.evidenceHash === "string" ? doc.evidenceHash : "",
  finishedAt: iso(doc.finishedAt),
  id: String(doc.id),
  outputSummary:
    typeof doc.outputSummary === "string" ? doc.outputSummary : undefined,
  startedAt: iso(doc.startedAt),
  status: doc.status === "passed" ? "passed" : "failed",
});

const diffStat = (value: unknown): ExecutionDiffStatDTO[] =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const source = item as Record<string, unknown>;
        if (typeof source.path !== "string") return [];
        return [
          {
            ...(typeof source.additions === "number"
              ? { additions: source.additions }
              : {}),
            ...(typeof source.deletions === "number"
              ? { deletions: source.deletions }
              : {}),
            path: source.path,
          },
        ];
      })
    : [];

/** Maps a durable job without capability claims, filesystem paths or raw logs. */
export const toExecutionJobDTO = (
  doc: Document,
  checks: Document[],
): ExecutionJobDTO => ({
  allowedPaths: stringArray(doc.allowedPaths),
  artifactsExpireAt: iso(doc.artifactsExpireAt),
  baseCommit: typeof doc.baseCommit === "string" ? doc.baseCommit : "",
  branch: typeof doc.branch === "string" ? doc.branch : "",
  changedPaths: stringArray(doc.changedPaths),
  checks: checks.map(toExecutionCheckDTO),
  createdAt: iso(doc.createdAt),
  diff: typeof doc.diff === "string" ? doc.diff : undefined,
  diffHash: typeof doc.diffHash === "string" ? doc.diffHash : undefined,
  diffStat: diffStat(doc.diffStat),
  diffTruncated: doc.diffTruncated === true,
  errorSummary:
    typeof doc.errorSummary === "string" ? doc.errorSummary : undefined,
  evidenceHash:
    typeof doc.evidenceHash === "string" ? doc.evidenceHash : undefined,
  finishedAt: typeof doc.finishedAt === "string" ? doc.finishedAt : undefined,
  id: String(doc.id),
  stage: doc.stage as ExecutionStage,
  startedAt: typeof doc.startedAt === "string" ? doc.startedAt : undefined,
  status: doc.status as ExecutionJobStatus,
  updatedAt: iso(doc.updatedAt),
  workerSummary:
    typeof doc.workerSummary === "string" ? doc.workerSummary : undefined,
});

const reviewFindings = (value: unknown): IndependentReviewFindingDTO[] =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const finding = item as Record<string, unknown>;
        if (
          !["architecture", "correctness", "security", "tests"].includes(
            String(finding.category),
          ) ||
          !["blocking", "warning"].includes(String(finding.severity)) ||
          typeof finding.summary !== "string"
        ) {
          return [];
        }
        return [
          {
            category:
              finding.category as IndependentReviewFindingDTO["category"],
            ...(typeof finding.path === "string" ? { path: finding.path } : {}),
            severity:
              finding.severity as IndependentReviewFindingDTO["severity"],
            summary: finding.summary,
          },
        ];
      })
    : [];

/** Maps deployment evidence without process, database or workspace identifiers. */
export const toPreviewDeploymentDTO = (
  doc: Document,
  checks: Document[],
): PreviewDeploymentDTO => ({
  artifactHash:
    typeof doc.artifactHash === "string" ? doc.artifactHash : undefined,
  artifactKind: "local-git-preview",
  baseCommit: typeof doc.baseCommit === "string" ? doc.baseCommit : "",
  branch: typeof doc.branch === "string" ? doc.branch : "",
  checks: checks.map(toExecutionCheckDTO),
  commitSHA: typeof doc.commitSHA === "string" ? doc.commitSHA : undefined,
  createdAt: iso(doc.createdAt),
  environment: "local-preview",
  evidenceHash:
    typeof doc.evidenceHash === "string" ? doc.evidenceHash : undefined,
  errorSummary:
    typeof doc.errorSummary === "string" ? doc.errorSummary : undefined,
  expiresAt: iso(doc.expiresAt),
  healthSummary:
    typeof doc.healthSummary === "string" ? doc.healthSummary : undefined,
  id: String(doc.id),
  previewURL: typeof doc.previewURL === "string" ? doc.previewURL : undefined,
  reviewer:
    typeof doc.reviewStatus === "string" &&
    typeof doc.reviewEvidenceHash === "string" &&
    typeof doc.reviewSummary === "string"
      ? {
          completedAt: iso(doc.reviewCompletedAt),
          evidenceHash: doc.reviewEvidenceHash,
          findings: reviewFindings(doc.reviewFindings),
          model:
            typeof doc.reviewModel === "string" ? doc.reviewModel : undefined,
          status:
            doc.reviewStatus === "approved" ? "approved" : "changes_requested",
          summary: doc.reviewSummary,
        }
      : undefined,
  runtimeState:
    doc.runtimeState === "active" || doc.runtimeState === "stopped"
      ? doc.runtimeState
      : "pending",
  sourceDiffHash:
    typeof doc.sourceDiffHash === "string" ? doc.sourceDiffHash : "",
  stage: doc.stage as PreviewDeploymentStage,
  status: doc.status as PreviewDeploymentStatus,
  treeHash: typeof doc.treeHash === "string" ? doc.treeHash : undefined,
  updatedAt: iso(doc.updatedAt),
});

/** Maps a Change Request to an explicit non-executable browser contract. */
export const toChangeRequestDTO = (
  doc: Document,
  approval?: Document,
  projection: {
    acceptance?: Document;
    executionEnabled?: boolean;
    executionJob?: Document;
    executionReason?: string;
    checkResults?: Document[];
    deployment?: Document;
    deploymentChecks?: Document[];
    previewAcceptance?: Document;
    previewEnabled?: boolean;
    previewReason?: string;
  } = {},
): ChangeRequestDTO => ({
  acceptance: projection.acceptance
    ? toImplementationAcceptanceDTO(projection.acceptance)
    : undefined,
  affectedPaths: stringArray(doc.affectedPaths),
  approval: approval ? toPlanApprovalDTO(approval) : undefined,
  blockedReason:
    typeof doc.blockedReason === "string" ? doc.blockedReason : undefined,
  checks: stringArray(doc.checks),
  conversationID: relationID(doc.conversation),
  createdAt: iso(doc.createdAt),
  execution: {
    enabled: projection.executionEnabled === true,
    job: projection.executionJob
      ? toExecutionJobDTO(
          projection.executionJob,
          projection.checkResults || [],
        )
      : undefined,
    reason: projection.executionReason,
  },
  expiresAt: iso(doc.expiresAt),
  id: String(doc.id),
  normalizedIntent:
    typeof doc.normalizedIntent === "string" ? doc.normalizedIntent : "",
  originalRequest:
    typeof doc.originalRequest === "string" ? doc.originalRequest : "",
  plan: typeof doc.plan === "string" ? doc.plan : "",
  planHash: typeof doc.planHash === "string" ? doc.planHash : "",
  preview: {
    acceptance: projection.previewAcceptance
      ? toPreviewAcceptanceDTO(projection.previewAcceptance)
      : undefined,
    deployment: projection.deployment
      ? toPreviewDeploymentDTO(
          projection.deployment,
          projection.deploymentChecks || [],
        )
      : undefined,
    enabled: projection.previewEnabled === true,
    reason: projection.previewReason,
  },
  riskLevel: doc.riskLevel as ChangeRiskLevel,
  scopeHash: typeof doc.scopeHash === "string" ? doc.scopeHash : "",
  sourceMessageID: relationID(doc.sourceMessage),
  state: doc.state as ChangeRequestState,
  title: typeof doc.title === "string" ? doc.title : "Change Request",
  type: doc.type as ChangeRequestType,
  updatedAt: iso(doc.updatedAt),
  version: Number(doc.version || 1),
});

export const toConversationDTO = (doc: Document): ConversationDTO => ({
  createdAt: iso(doc.createdAt),
  id: String(doc.id),
  lastMessageAt: iso(doc.lastMessageAt),
  status: doc.status === "archived" ? "archived" : "active",
  title: typeof doc.title === "string" ? doc.title : "Диалог",
  updatedAt: iso(doc.updatedAt),
});

export const toMessageDTO = (doc: Document): MessageDTO => ({
  content: typeof doc.content === "string" ? doc.content : "",
  conversationID: relationID(doc.conversation),
  createdAt: iso(doc.createdAt),
  id: String(doc.id),
  kind: doc.kind as MessageKind,
  role: doc.role as MessageRole,
  runID: typeof doc.runID === "string" ? doc.runID : undefined,
  sequence: Number(doc.sequence || 0),
  usage: usage(doc.usageSummary),
});

export const toRunDTO = (doc: Document): RunDTO => ({
  conversationID: relationID(doc.conversation),
  createdAt: iso(doc.createdAt),
  errorSummary:
    typeof doc.errorSummary === "string" ? doc.errorSummary : undefined,
  finishedAt: typeof doc.finishedAt === "string" ? doc.finishedAt : undefined,
  id: String(doc.id),
  model: typeof doc.model === "string" ? doc.model : undefined,
  provider: "openai-codex",
  sandboxProfile: "analysis-readonly",
  startedAt: typeof doc.startedAt === "string" ? doc.startedAt : undefined,
  status: doc.status as RunStatus,
  threadID: typeof doc.threadID === "string" ? doc.threadID : undefined,
  updatedAt: iso(doc.updatedAt),
  usage: usage(doc.usage),
});

export const toStreamEvent = (doc: Document): AIStreamEvent => ({
  createdAt: iso(doc.occurredAt),
  id: typeof doc.eventID === "string" ? doc.eventID : String(doc.id),
  payload:
    doc.payload && typeof doc.payload === "object"
      ? (doc.payload as Record<string, unknown>)
      : {},
  runID: relationID(doc.run),
  sequence: Number(doc.sequence || 0),
  type: doc.type as AIStreamEvent["type"],
  visibility: doc.visibility as AIStreamEvent["visibility"],
});
