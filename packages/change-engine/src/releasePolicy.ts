/**
 * @file packages/change-engine/src/releasePolicy.ts
 * @version 2026-08-22
 * @description Проверяет OCI evidence и связывает отдельное release approval с exact artifact.
 */

import { createHash } from "node:crypto";

import type { ReleaseMigrationDTO } from "@realize/ai-contracts";

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const digestPattern = /^sha256:[a-f0-9]{64}$/;
const hashPattern = /^[a-f0-9]{64}$/;

/** Связывает idempotent release job с exact accepted preview evidence. */
export const createReleaseCandidateKey = (input: {
  changeRequestID: string;
  sourceAcceptanceHash: string;
  sourcePreviewArtifactHash: string;
  sourcePreviewEvidenceHash: string;
}): string =>
  sha256(
    JSON.stringify([
      input.changeRequestID,
      input.sourcePreviewArtifactHash,
      input.sourcePreviewEvidenceHash,
      input.sourceAcceptanceHash,
    ]),
  );

/** Хеширует полный verified result вместе с exact source acceptance. */
export const createReleaseEvidenceHash = (input: {
  candidateKey: string;
  configVersion: string;
  gitCommit: string;
  healthSummary: string;
  imageDigest: string;
  imageRef: string;
  manifestHash: string;
  migrationSetHash: string;
  migrations: ReleaseMigrationDTO[];
  pluginVersions: Record<string, string>;
  previewStatus: "healthy";
  previewURL: string;
  provenanceRef: string;
  sbomDigest: string;
  signatureRef: string;
  signatureVerified: true;
  sourceAcceptanceHash: string;
  sourcePreviewArtifactHash: string;
  sourcePreviewEvidenceHash: string;
}): string =>
  sha256(
    JSON.stringify([
      input.candidateKey,
      input.sourceAcceptanceHash,
      input.sourcePreviewArtifactHash,
      input.sourcePreviewEvidenceHash,
      input.gitCommit,
      input.imageRef,
      input.imageDigest,
      input.manifestHash,
      input.sbomDigest,
      input.signatureRef,
      input.signatureVerified,
      input.provenanceRef,
      input.migrationSetHash,
      [...input.migrations].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
      input.configVersion,
      Object.entries(input.pluginVersions).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
      input.previewURL,
      input.previewStatus,
      input.healthSummary,
      "production",
    ]),
  );

/** Возвращает стабильный hash упорядоченного набора forward migrations. */
export const createMigrationSetHash = (
  migrations: ReleaseMigrationDTO[],
): string =>
  sha256(
    JSON.stringify(
      [...migrations]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(({ checksum, direction, id }) => [id, checksum, direction]),
    ),
  );

/** Fail-closed проверка evidence, полученного от server-owned orchestrator. */
export const assessReleaseCandidate = (input: {
  configVersion: string;
  evidenceHash: string;
  gitCommit: string;
  imageDigest: string;
  imageRef: string;
  manifestHash: string;
  migrationSetHash: string;
  migrations: ReleaseMigrationDTO[];
  pluginVersions: Record<string, string>;
  previewStatus: string;
  previewURL: string;
  provenanceRef: string;
  sbomDigest: string;
  signatureRef: string;
  signatureVerified: boolean;
}): { allowed: true } | { allowed: false; reason: string } => {
  if (!/^[a-f0-9]{40}$/.test(input.gitCommit)) {
    return { allowed: false, reason: "Release commit SHA is invalid." };
  }
  if (!digestPattern.test(input.imageDigest)) {
    return { allowed: false, reason: "OCI image digest is invalid." };
  }
  const imageReference = input.imageRef.split("@");
  if (
    imageReference.length !== 2 ||
    imageReference[1] !== input.imageDigest ||
    !imageReference[0]?.includes("/") ||
    !/^[a-z0-9][a-z0-9._:/-]{2,511}$/.test(imageReference[0])
  ) {
    return {
      allowed: false,
      reason: "OCI image reference is not bound to the reported digest.",
    };
  }
  if (
    !hashPattern.test(input.manifestHash) ||
    !hashPattern.test(input.migrationSetHash) ||
    !hashPattern.test(input.evidenceHash)
  ) {
    return { allowed: false, reason: "Release evidence hash is invalid." };
  }
  if (!digestPattern.test(input.sbomDigest)) {
    return { allowed: false, reason: "SBOM digest is invalid." };
  }
  if (!input.signatureVerified || input.signatureRef.trim().length < 3) {
    return {
      allowed: false,
      reason: "OCI image signature is missing or has not been verified.",
    };
  }
  if (
    input.provenanceRef.trim().length < 3 ||
    input.configVersion.trim().length < 1 ||
    Object.keys(input.pluginVersions).length === 0 ||
    Object.entries(input.pluginVersions).some(
      ([name, version]) => !name.trim() || !version.trim(),
    )
  ) {
    return {
      allowed: false,
      reason: "Release provenance, config or plugin versions are incomplete.",
    };
  }
  if (createMigrationSetHash(input.migrations) !== input.migrationSetHash) {
    return {
      allowed: false,
      reason: "Migration set does not match its immutable hash.",
    };
  }
  if (
    new Set(input.migrations.map((migration) => migration.id)).size !==
    input.migrations.length
  ) {
    return { allowed: false, reason: "Release migration IDs must be unique." };
  }
  if (
    input.migrations.some(
      (migration) =>
        migration.direction !== "up" ||
        !migration.id ||
        !hashPattern.test(migration.checksum),
    )
  ) {
    return { allowed: false, reason: "Release migration evidence is invalid." };
  }
  try {
    const previewURL = new URL(input.previewURL);
    if (previewURL.protocol !== "https:") {
      return { allowed: false, reason: "OCI preview URL must use HTTPS." };
    }
  } catch {
    return { allowed: false, reason: "OCI preview URL is invalid." };
  }
  if (input.previewStatus !== "healthy") {
    return { allowed: false, reason: "OCI preview is not healthy." };
  }
  return { allowed: true };
};

/** Связывает решение человека со всеми security-relevant release полями. */
export const createReleaseApprovalBinding = (input: {
  actorID: string;
  actorRoles: string[];
  changeRequestID: string;
  decision: "approved" | "rejected";
  environment: "production";
  evidenceHash: string;
  expiresAt: string;
  gitCommit: string;
  imageDigest: string;
  manifestHash: string;
  migrationSetHash: string;
  sbomDigest: string;
  signatureRef: string;
  version: number;
}): string =>
  sha256(
    JSON.stringify([
      input.changeRequestID,
      input.version,
      input.gitCommit,
      input.imageDigest,
      input.manifestHash,
      input.sbomDigest,
      input.signatureRef,
      input.migrationSetHash,
      input.evidenceHash,
      input.environment,
      input.decision,
      input.actorID,
      [...input.actorRoles].sort(),
      input.expiresAt,
    ]),
  );
