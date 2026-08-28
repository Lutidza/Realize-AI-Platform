/**
 * @file packages/ai-contracts/src/release.ts
 * @version 2026-08-22
 * @description Задаёт browser-safe контракт OCI-кандидата и отдельного release approval.
 */

/** Состояние подготовки одного неизменяемого OCI-кандидата. */
export type ReleaseCandidateStatus =
  | "approved"
  | "blocked"
  | "building"
  | "deploying_preview"
  | "expired"
  | "failed"
  | "preparing"
  | "queued"
  | "ready"
  | "rejected"
  | "scanning"
  | "verifying_preview";

/** Укрупнённый этап, пригодный для стабильного отображения в админке. */
export type ReleaseCandidateStage =
  | "build"
  | "complete"
  | "oci_preview"
  | "queued"
  | "security_evidence"
  | "source_validation";

/** Миграция, вошедшая в неизменяемый release manifest. */
export type ReleaseMigrationDTO = {
  checksum: string;
  direction: "up";
  id: string;
};

/** Browser-safe evidence для OCI-кандидата до production deployment. */
export type ReleaseCandidateDTO = {
  artifactKind: "oci-image";
  configVersion?: string;
  createdAt: string;
  environment: "oci-preview";
  errorSummary?: string;
  evidenceHash?: string;
  expiresAt: string;
  gitCommit: string;
  healthSummary?: string;
  id: string;
  imageDigest?: string;
  imageRef?: string;
  manifestHash?: string;
  migrationSetHash?: string;
  migrations: ReleaseMigrationDTO[];
  pluginVersions: Record<string, string>;
  previewStatus: "healthy" | "pending" | "unhealthy";
  previewURL?: string;
  provenanceRef?: string;
  sbomDigest?: string;
  signatureRef?: string;
  signatureVerified: boolean;
  sourcePreviewArtifactHash: string;
  stage: ReleaseCandidateStage;
  status: ReleaseCandidateStatus;
  targetEnvironment: "production";
  updatedAt: string;
};

/** Решение человека, связанное с exact OCI digest и release manifest. */
export type ReleaseApprovalDTO = {
  actorRole: string;
  boundHash: string;
  comment?: string;
  createdAt: string;
  decision: "approved" | "rejected";
  environment: "production";
  expiresAt: string;
  id: string;
  imageDigest: string;
  manifestHash: string;
  migrationSetHash: string;
};

/** Доступность release gate и последнее долговечное evidence. */
export type ChangeReleaseDTO = {
  approval?: ReleaseApprovalDTO;
  candidate?: ReleaseCandidateDTO;
  enabled: boolean;
  reason?: string;
};

/** Optimistic-lock запрос на подготовку OCI-кандидата из принятого preview. */
export type PrepareReleaseInput = {
  expectedPreviewArtifactHash: string;
  expectedVersion: number;
};

/** Optimistic-lock запрос на принятие exact release artifact. */
export type ApproveReleaseInput = {
  comment?: string;
  expectedImageDigest: string;
  expectedManifestHash: string;
  expectedMigrationSetHash: string;
  expectedVersion: number;
};

/** Optimistic-lock запрос на отклонение exact release artifact. */
export type RejectReleaseInput = {
  comment: string;
  expectedImageDigest: string;
  expectedManifestHash: string;
  expectedMigrationSetHash: string;
  expectedVersion: number;
};
