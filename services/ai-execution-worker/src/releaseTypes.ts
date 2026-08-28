/**
 * @file services/ai-execution-worker/src/releaseTypes.ts
 * @version 2026-08-22
 * @description Описывает внутренний provider-neutral контракт OCI release worker.
 */

import type { ReleaseMigrationDTO } from "@realize/ai-contracts";

/** OCI-задача, atomically claimed из PostgreSQL. */
export type ClaimedReleaseCandidate = {
  candidateKey: string;
  changeRequestID: number;
  expiresAt: string;
  gitCommit: string;
  id: number;
  sourceAcceptanceHash: string;
  sourcePreviewArtifactHash: string;
  sourcePreviewEvidenceHash: string;
};

/** JSON-запрос к server-owned release orchestrator executable. */
export type ReleaseOrchestratorInput = {
  candidateKey: string;
  changeRequestID: string;
  expiresAt: string;
  gitCommit: string;
  repositoryRoot: string;
  schemaVersion: 1;
  sourceAcceptanceHash: string;
  sourcePreviewArtifactHash: string;
  sourcePreviewEvidenceHash: string;
  targetEnvironment: "production";
};

/** Строгий результат build, security evidence и OCI preview. */
export type ReleaseOrchestratorResult = {
  configVersion: string;
  gitCommit: string;
  healthSummary: string;
  imageDigest: string;
  imageRef: string;
  manifestHash: string;
  migrationSetHash: string;
  migrations: ReleaseMigrationDTO[];
  orchestratorReference?: string;
  pluginVersions: Record<string, string>;
  previewStatus: "healthy";
  previewURL: string;
  provenanceRef: string;
  sbomDigest: string;
  schemaVersion: 1;
  signatureRef: string;
  signatureVerified: true;
};
