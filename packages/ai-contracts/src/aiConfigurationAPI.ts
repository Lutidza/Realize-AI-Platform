/**
 * @file packages/ai-contracts/src/aiConfigurationAPI.ts
 * @version 1.0.1
 * @date 2026-10-12
 * @description Задаёт strict browser DTO первого installation configuration API.
 * @docref Realize — AI Platform v1.0 — API и streaming contracts
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import type {
  ActiveAIConfigPointer,
  AIConfigArtifact,
  AIConfigRelease,
  AIConfigValidationIssue,
  SystemAIConfigProjection,
} from "./aiConfiguration";

/** Explicit lineage reference accepted only after server-side hash verification. */
export type AIConfigBaseReleaseDTO = {
  id: string;
  manifestHash: string;
};

/** Bounded draft projection used by lists and mutation replays. */
export type AIConfigDraftSummaryDTO = {
  artifactCount: number;
  baseRelease?: AIConfigBaseReleaseDTO;
  createdAt: string;
  createdBy: string;
  id: string;
  revision: number;
  schemaVersion: "1.0";
  state: "editing" | "ready" | "released" | "validating";
  updatedAt: string;
  updatedBy: string;
};

/** Authorized detail projection; no raw Payload document fields are exposed. */
export type AIConfigDraftDTO = AIConfigDraftSummaryDTO & {
  artifacts: readonly AIConfigArtifact[];
};

/** Bounded immutable release projection used by bootstrap and mutation replay. */
export type AIConfigReleaseSummaryDTO = {
  artifactCount: number;
  createdAt: string;
  createdBy: string;
  id: string;
  manifestHash: string;
  schemaVersion: "1.0";
  sourceDraftID: string;
  sourceDraftRevision: number;
  systemCompatibility: AIConfigRelease["systemCompatibility"];
  version: number;
};

/** Authorized release detail with an exact immutable artifact snapshot. */
export type AIConfigReleaseDTO = AIConfigRelease;

/** Redacted server ceiling needed by the settings editor. */
export type SystemAIConfigProjectionDTO = SystemAIConfigProjection;

/** Initial settings payload assembled without leaking persistence internals. */
export type AIConfigBootstrapDTO = {
  activePointer: ActiveAIConfigPointer | null;
  drafts: readonly AIConfigDraftSummaryDTO[];
  releases: readonly AIConfigReleaseSummaryDTO[];
  schemaVersion: "1.0";
  system: SystemAIConfigProjectionDTO;
};

/** Full aggregate input for creating one editing draft. */
export type CreateAIConfigDraftInput = {
  artifacts: readonly AIConfigArtifact[];
  baseRelease: AIConfigBaseReleaseDTO | null;
  draftID: string;
  expectedRevision: 0;
  schemaVersion: "1.0";
};

/** Optimistic full replacement of editable draft content. */
export type UpdateAIConfigDraftInput = {
  artifacts: readonly AIConfigArtifact[];
  baseRelease: AIConfigBaseReleaseDTO | null;
  expectedRevision: number;
  schemaVersion: "1.0";
};

/** Exact draft revision selected for structural and system validation. */
export type ValidateAIConfigDraftInput = {
  draftID: string;
  expectedRevision: number;
  schemaVersion: "1.0";
};

/** Hash-bound immutable release command; release metadata remains server-owned. */
export type CreateAIConfigReleaseInput = {
  draftID: string;
  expectedDraftRevision: number;
  expectedSystemManifestHash: string;
  schemaVersion: "1.0";
};

/** Переключает exact immutable release при неизменных system ceiling и версии указателя. */
export type ActivateAIConfigReleaseInput = {
  action: "activate" | "rollback";
  expectedPointerVersion: number;
  expectedReleaseManifestHash: string;
  expectedSystemManifestHash: string;
  releaseID: string;
  schemaVersion: "1.0";
};

/** Deterministic validation result persisted for idempotent replay. */
export type AIConfigValidationDTO = {
  checkedRevision: number;
  draftID: string;
  issues: readonly AIConfigValidationIssue[];
  resultingRevision: number;
  state: "editing" | "ready";
  systemManifestHash: string;
  valid: boolean;
};
