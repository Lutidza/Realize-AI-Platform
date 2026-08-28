/**
 * @file scripts/release/github-release-contract.mjs
 * @version 2026-08-27
 * @docref ADR-0011
 * @see documentation/architecture/decisions/ADR-0011-github-ghcr-vps-release-preview.md
 * @description Validates the GitHub release adapter configuration, request and JSON boundaries.
 */

import { isAbsolute, resolve } from "node:path";

const hashPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const refPattern = /^(?!.*\.\.)(?!\/)(?!.*\/$)[A-Za-z0-9._/-]{1,200}$/;

const requiredString = (value, name, pattern) => {
  if (typeof value !== "string" || !value.trim() || value.length > 2_000) {
    throw new Error(`${name} is required.`);
  }
  if (pattern && !pattern.test(value)) throw new Error(`${name} is invalid.`);
  return value;
};

const integer = (value, fallback, minimum, maximum, name) => {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${name} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return parsed;
};

/** Narrows an untrusted value to a plain JSON object. */
export const asObject = (value, name) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object.`);
  }
  return value;
};

/** Parses JSON without exposing the original untrusted payload in errors. */
export const parseJSON = (value, name) => {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${name} returned invalid JSON.`);
  }
};

/** Returns the unique workflow run title for a candidate key. */
export const candidateTitle = (key) => `Realize release candidate ${key}`;

/** Returns the only remote ref namespace writable by this adapter. */
export const candidateRef = (key) => `refs/heads/ai/release-candidates/${key}`;

/** Validates the trusted environment consumed by the GitHub adapter. */
export const readGitHubAdapterConfig = (environment = process.env) => {
  const ghCommand = requiredString(
    environment.REALIZE_AI_GITHUB_GH_COMMAND,
    "REALIZE_AI_GITHUB_GH_COMMAND",
  );
  const gitCommand = requiredString(
    environment.REALIZE_AI_GITHUB_GIT_COMMAND,
    "REALIZE_AI_GITHUB_GIT_COMMAND",
  );
  if (!isAbsolute(ghCommand) || !isAbsolute(gitCommand)) {
    throw new Error("GitHub adapter commands must use absolute paths.");
  }
  return {
    ghCommand,
    gitCommand,
    pollMs: integer(
      environment.REALIZE_AI_GITHUB_POLL_MS,
      5_000,
      1_000,
      60_000,
      "REALIZE_AI_GITHUB_POLL_MS",
    ),
    repository: requiredString(
      environment.REALIZE_AI_GITHUB_REPOSITORY,
      "REALIZE_AI_GITHUB_REPOSITORY",
      repositoryPattern,
    ),
    runTimeoutMs: integer(
      environment.REALIZE_AI_GITHUB_RUN_TIMEOUT_MS,
      90 * 60 * 1_000,
      60_000,
      3 * 60 * 60 * 1_000,
      "REALIZE_AI_GITHUB_RUN_TIMEOUT_MS",
    ),
    token: requiredString(environment.GH_TOKEN, "GH_TOKEN"),
    workflow: requiredString(
      environment.REALIZE_AI_GITHUB_WORKFLOW || "prepare-release-candidate.yml",
      "REALIZE_AI_GITHUB_WORKFLOW",
      /^[A-Za-z0-9._/-]{1,200}\.ya?ml$/,
    ),
    workflowRef: requiredString(
      environment.REALIZE_AI_GITHUB_WORKFLOW_REF || "main",
      "REALIZE_AI_GITHUB_WORKFLOW_REF",
      refPattern,
    ),
  };
};

/** Validates the worker-owned JSON request before any network side effect. */
export const parseGitHubReleaseRequest = (
  value,
  expectedRepositoryRoot = process.cwd(),
) => {
  const source = asObject(value, "Release request");
  if (source.schemaVersion !== 1 || source.targetEnvironment !== "production") {
    throw new Error("Release request contract is unsupported.");
  }
  const repositoryRoot = resolve(
    requiredString(source.repositoryRoot, "repositoryRoot"),
  );
  if (repositoryRoot !== resolve(expectedRepositoryRoot)) {
    throw new Error("Release request repositoryRoot differs from adapter cwd.");
  }
  const expiresAt = requiredString(source.expiresAt, "expiresAt");
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expiresAt) ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    new Date(expiresAt).toISOString() !== expiresAt ||
    Date.parse(expiresAt) <= Date.now()
  ) {
    throw new Error("Release request expiresAt must be in the future.");
  }
  return {
    candidateKey: requiredString(
      source.candidateKey,
      "candidateKey",
      hashPattern,
    ),
    changeRequestID: requiredString(
      source.changeRequestID,
      "changeRequestID",
      /^[1-9][0-9]{0,18}$/,
    ),
    expiresAt,
    gitCommit: requiredString(source.gitCommit, "gitCommit", commitPattern),
    repositoryRoot,
    schemaVersion: 1,
    sourceAcceptanceHash: requiredString(
      source.sourceAcceptanceHash,
      "sourceAcceptanceHash",
      hashPattern,
    ),
    sourcePreviewArtifactHash: requiredString(
      source.sourcePreviewArtifactHash,
      "sourcePreviewArtifactHash",
      hashPattern,
    ),
    sourcePreviewEvidenceHash: requiredString(
      source.sourcePreviewEvidenceHash,
      "sourcePreviewEvidenceHash",
      hashPattern,
    ),
    targetEnvironment: "production",
  };
};
