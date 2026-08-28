#!/usr/bin/env node
/**
 * @file scripts/release/create-release-candidate-evidence.mjs
 * @version 2026-08-27
 * @docref ADR-0011
 * @see documentation/architecture/decisions/ADR-0011-github-ghcr-vps-release-preview.md
 * @description Creates the exact release manifest and worker evidence envelope after signed preview verification.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createReleaseSourceInventory } from "./release-source-inventory.mjs";

const hashPattern = /^[a-f0-9]{64}$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const imagePattern = /^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const required = (value, name, pattern, maximum = 2_000) => {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new Error(`${name} is required.`);
  }
  if (pattern && !pattern.test(value)) throw new Error(`${name} is invalid.`);
  return value;
};

const parseObject = async (path, name) => {
  let value;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(`${name} must contain valid JSON.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must contain a JSON object.`);
  }
  return value;
};

const validatePreview = (preview, environment) => {
  if (
    preview.schemaVersion !== 1 ||
    preview.candidateKey !== environment.CANDIDATE_KEY ||
    preview.gitCommit !== environment.GIT_COMMIT ||
    preview.previewStatus !== "healthy"
  ) {
    throw new Error("Remote preview evidence has another identity or status.");
  }
  const previewURL = required(preview.previewURL, "previewURL");
  if (new URL(previewURL).protocol !== "https:") {
    throw new Error("previewURL must use HTTPS.");
  }
  return {
    healthSummary: required(
      preview.healthSummary,
      "healthSummary",
      undefined,
      4_000,
    ),
    previewStatus: "healthy",
    previewURL,
  };
};

const validateSecurityEvidence = async (input) => {
  const sbom = await readFile(input.sbomPath);
  const actualSBOMDigest = `sha256:${sha256(sbom)}`;
  if (actualSBOMDigest !== input.sbomDigest) {
    throw new Error("SBOM file does not match SBOM_DIGEST.");
  }
  const provenance = await parseObject(input.provenancePath, "Provenance");
  if (Object.keys(provenance).length === 0) {
    throw new Error("Provenance must not be empty.");
  }
  const verification = JSON.parse(
    await readFile(input.signatureVerificationPath, "utf8"),
  );
  const serialized = JSON.stringify(verification);
  if (
    !Array.isArray(verification) ||
    verification.length === 0 ||
    !serialized.includes(input.imageDigest.slice("sha256:".length)) ||
    !serialized.includes(input.candidateKey) ||
    !serialized.includes(input.gitCommit)
  ) {
    throw new Error("Cosign verification is not bound to this candidate.");
  }
  return {
    provenanceHash: sha256(JSON.stringify(provenance)),
    signatureVerificationHash: sha256(serialized),
  };
};

/** Creates both the canonical manifest and the adapter-only evidence envelope. */
export const createReleaseCandidateEvidence = async (input) => {
  const environment = input.environment;
  const candidateKey = required(
    environment.CANDIDATE_KEY,
    "CANDIDATE_KEY",
    hashPattern,
  );
  const gitCommit = required(
    environment.GIT_COMMIT,
    "GIT_COMMIT",
    commitPattern,
  );
  const imageDigest = required(
    environment.IMAGE_DIGEST,
    "IMAGE_DIGEST",
    digestPattern,
  );
  const imageRef = required(environment.IMAGE_REF, "IMAGE_REF", imagePattern);
  if (!imageRef.endsWith(`@${imageDigest}`)) {
    throw new Error("IMAGE_REF is not bound to IMAGE_DIGEST.");
  }
  const sourceHashes = {
    sourceAcceptanceHash: required(
      environment.SOURCE_ACCEPTANCE_HASH,
      "SOURCE_ACCEPTANCE_HASH",
      hashPattern,
    ),
    sourcePreviewArtifactHash: required(
      environment.SOURCE_PREVIEW_ARTIFACT_HASH,
      "SOURCE_PREVIEW_ARTIFACT_HASH",
      hashPattern,
    ),
    sourcePreviewEvidenceHash: required(
      environment.SOURCE_PREVIEW_EVIDENCE_HASH,
      "SOURCE_PREVIEW_EVIDENCE_HASH",
      hashPattern,
    ),
  };
  const sbomDigest = required(
    environment.SBOM_DIGEST,
    "SBOM_DIGEST",
    digestPattern,
  );
  const preview = validatePreview(
    await parseObject(input.previewPath, "Remote preview evidence"),
    environment,
  );
  const security = await validateSecurityEvidence({
    candidateKey,
    gitCommit,
    imageDigest,
    provenancePath: input.provenancePath,
    sbomDigest,
    sbomPath: input.sbomPath,
    signatureVerificationPath: input.signatureVerificationPath,
  });
  const inventory = await createReleaseSourceInventory(input.sourceRoot);
  const manifest = {
    candidateKey,
    changeRequestID: required(
      environment.CHANGE_REQUEST_ID,
      "CHANGE_REQUEST_ID",
      /^[1-9][0-9]{0,18}$/,
    ),
    configVersion: inventory.configVersion,
    createdAt: required(
      environment.GIT_COMMIT_CREATED_AT,
      "GIT_COMMIT_CREATED_AT",
    ),
    expiresAt: required(environment.EXPIRES_AT, "EXPIRES_AT"),
    gitCommit,
    imageDigest,
    imageRef,
    installationID: required(
      environment.INSTALLATION_ID,
      "INSTALLATION_ID",
      /^[A-Za-z0-9._:-]{1,200}$/,
    ),
    migrationSetHash: inventory.migrationSetHash,
    migrations: inventory.migrations,
    pluginVersions: inventory.pluginVersions,
    provenanceHash: security.provenanceHash,
    provenanceRef: required(environment.PROVENANCE_REF, "PROVENANCE_REF"),
    releaseID: candidateKey,
    sbomDigest,
    schemaVersion: 1,
    signatureRef: required(environment.SIGNATURE_REF, "SIGNATURE_REF"),
    signatureVerificationHash: security.signatureVerificationHash,
    ...sourceHashes,
    targetEnvironment: "production",
    ...preview,
  };
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestHash = sha256(manifestBytes);
  const result = {
    configVersion: inventory.configVersion,
    gitCommit,
    healthSummary: preview.healthSummary,
    imageDigest,
    imageRef,
    manifestHash,
    migrationSetHash: inventory.migrationSetHash,
    migrations: inventory.migrations,
    orchestratorReference: required(
      environment.ORCHESTRATOR_REFERENCE,
      "ORCHESTRATOR_REFERENCE",
    ),
    pluginVersions: inventory.pluginVersions,
    previewStatus: "healthy",
    previewURL: preview.previewURL,
    provenanceRef: manifest.provenanceRef,
    sbomDigest,
    schemaVersion: 1,
    signatureRef: manifest.signatureRef,
    signatureVerified: true,
  };
  const envelope = {
    binding: {
      candidateKey,
      changeRequestID: manifest.changeRequestID,
      gitCommit,
      ...sourceHashes,
      targetEnvironment: "production",
    },
    result,
    schemaVersion: 1,
  };
  await mkdir(input.outputRoot, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(input.outputRoot, "release-manifest.json"),
      manifestBytes,
      {
        mode: 0o640,
      },
    ),
    writeFile(
      resolve(input.outputRoot, "release-evidence.json"),
      `${JSON.stringify(envelope, null, 2)}\n`,
      { mode: 0o640 },
    ),
  ]);
  return { envelope, manifest, manifestHash };
};

const isEntrypoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  createReleaseCandidateEvidence({
    environment: process.env,
    outputRoot: resolve(process.argv[7] || "artifacts/release-candidate"),
    previewPath: resolve(process.argv[3] || "artifacts/preview.json"),
    provenancePath: resolve(process.argv[5] || "artifacts/provenance.json"),
    sbomPath: resolve(process.argv[4] || "artifacts/sbom.spdx.json"),
    signatureVerificationPath: resolve(
      process.argv[6] || "artifacts/signature-verification.json",
    ),
    sourceRoot: resolve(process.argv[2] || "."),
  }).catch((error) => {
    process.stderr.write(
      `[release-candidate-evidence] ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  });
}
