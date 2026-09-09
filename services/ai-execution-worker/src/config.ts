/**
 * @file services/ai-execution-worker/src/config.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет execution, source/release и integration runtime configuration.
 */

import { hostname, tmpdir } from "node:os";
import { isAbsolute, resolve } from "node:path";

/** Полностью проверенная process configuration одного worker instance. */
export type ExecutionWorkerConfig = {
  codexBinary?: string;
  databaseURL: string;
  integrationEncryptionKey?: string;
  model?: string;
  pollIntervalMs: number;
  previewEnabled: boolean;
  previewHost: "127.0.0.1";
  previewPortMax: number;
  previewPortMin: number;
  previewRoot: string;
  previewStartupTimeoutMs: number;
  promotionWorkspaceRoot: string;
  releaseEnabled: boolean;
  releaseOrchestratorArgs: string[];
  releaseOrchestratorCommand?: string;
  releaseOrchestratorEnvironment: NodeJS.ProcessEnv;
  releaseTimeoutMs: number;
  repositoryRoot: string;
  reviewModel?: string;
  reviewTimeoutMs: number;
  signingSecret: string;
  sourcePromotionEnabled: boolean;
  sourcePromotionGitCommand?: string;
  sourcePromotionTimeoutMs: number;
  turnTimeoutMs: number;
  workerID: string;
  workspaceRoot: string;
};

const integer = (
  value: string | undefined,
  fallback: number,
  minimum: number,
  name: string,
): number => {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}.`);
  }
  return parsed;
};

const stringArray = (value: string | undefined, name: string): string[] => {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${name} must be a JSON string array.`);
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length > 32 ||
    parsed.some((item) => typeof item !== "string" || item.length > 1_000)
  ) {
    throw new Error(
      `${name} must be a JSON string array with at most 32 items.`,
    );
  }
  return parsed;
};

const orchestratorEnvironment = (names: string[]): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV || "production",
  };
  for (const name of names) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
      throw new Error(
        "REALIZE_AI_RELEASE_ORCHESTRATOR_ENV_JSON contains an invalid environment variable name.",
      );
    }
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
};

/** Читает environment и падает до подключения к persistence. */
export const readExecutionWorkerConfig = (): ExecutionWorkerConfig => {
  if (process.env.REALIZE_AI_EXECUTION_ENABLED !== "true") {
    throw new Error("REALIZE_AI_EXECUTION_ENABLED must be true.");
  }
  const databaseURL =
    process.env.DATABASE_URI || process.env.DATABASE_URL || "";
  if (!databaseURL)
    throw new Error("DATABASE_URI or DATABASE_URL is required.");
  const signingSecret = process.env.REALIZE_AI_EXECUTION_SIGNING_SECRET || "";
  if (Buffer.byteLength(signingSecret, "utf8") < 32) {
    throw new Error(
      "REALIZE_AI_EXECUTION_SIGNING_SECRET must contain at least 32 bytes.",
    );
  }

  const previewHost = process.env.REALIZE_AI_PREVIEW_HOST || "127.0.0.1";
  if (previewHost !== "127.0.0.1") {
    throw new Error("REALIZE_AI_PREVIEW_HOST must remain 127.0.0.1.");
  }
  const previewPortMin = integer(
    process.env.REALIZE_AI_PREVIEW_PORT_MIN,
    3_200,
    1_024,
    "REALIZE_AI_PREVIEW_PORT_MIN",
  );
  const previewPortMax = integer(
    process.env.REALIZE_AI_PREVIEW_PORT_MAX,
    3_299,
    previewPortMin,
    "REALIZE_AI_PREVIEW_PORT_MAX",
  );
  const releaseEnabled = process.env.REALIZE_AI_RELEASE_ENABLED === "true";
  const sourcePromotionEnabled =
    process.env.REALIZE_AI_SOURCE_PROMOTION_ENABLED === "true";
  const sourcePromotionGitCommand =
    process.env.REALIZE_AI_GITHUB_GIT_COMMAND || undefined;
  if (
    sourcePromotionEnabled &&
    (!sourcePromotionGitCommand || !isAbsolute(sourcePromotionGitCommand))
  ) {
    throw new Error(
      "REALIZE_AI_GITHUB_GIT_COMMAND must be an absolute executable path when source promotion is enabled.",
    );
  }
  const releaseOrchestratorCommand =
    process.env.REALIZE_AI_RELEASE_ORCHESTRATOR_COMMAND || undefined;
  if (
    releaseEnabled &&
    (!releaseOrchestratorCommand || !isAbsolute(releaseOrchestratorCommand))
  ) {
    throw new Error(
      "REALIZE_AI_RELEASE_ORCHESTRATOR_COMMAND must be an absolute executable path when release is enabled.",
    );
  }
  const releaseOrchestratorEnvNames = stringArray(
    process.env.REALIZE_AI_RELEASE_ORCHESTRATOR_ENV_JSON,
    "REALIZE_AI_RELEASE_ORCHESTRATOR_ENV_JSON",
  );

  return {
    codexBinary: process.env.REALIZE_CODEX_BINARY || undefined,
    databaseURL,
    integrationEncryptionKey:
      process.env.REALIZE_INTEGRATIONS_ENCRYPTION_KEY || undefined,
    model:
      process.env.REALIZE_AI_EXECUTION_MODEL || process.env.REALIZE_AI_MODEL,
    pollIntervalMs: integer(
      process.env.REALIZE_AI_EXECUTION_POLL_MS,
      2_000,
      250,
      "REALIZE_AI_EXECUTION_POLL_MS",
    ),
    previewEnabled: process.env.REALIZE_AI_PREVIEW_ENABLED === "true",
    previewHost,
    previewPortMax,
    previewPortMin,
    previewRoot: resolve(
      process.env.REALIZE_AI_PREVIEW_ROOT || `${tmpdir()}/realize-ai-previews`,
    ),
    previewStartupTimeoutMs: integer(
      process.env.REALIZE_AI_PREVIEW_STARTUP_TIMEOUT_MS,
      120_000,
      10_000,
      "REALIZE_AI_PREVIEW_STARTUP_TIMEOUT_MS",
    ),
    promotionWorkspaceRoot: resolve(
      process.env.REALIZE_AI_PROMOTION_WORKSPACE_ROOT ||
        `${tmpdir()}/realize-ai-promotion-workspaces`,
    ),
    releaseEnabled,
    releaseOrchestratorArgs: stringArray(
      process.env.REALIZE_AI_RELEASE_ORCHESTRATOR_ARGS_JSON,
      "REALIZE_AI_RELEASE_ORCHESTRATOR_ARGS_JSON",
    ),
    releaseOrchestratorCommand,
    releaseOrchestratorEnvironment: orchestratorEnvironment(
      releaseOrchestratorEnvNames,
    ),
    releaseTimeoutMs: integer(
      process.env.REALIZE_AI_RELEASE_TIMEOUT_MS,
      30 * 60 * 1_000,
      60_000,
      "REALIZE_AI_RELEASE_TIMEOUT_MS",
    ),
    repositoryRoot: resolve(
      process.env.REALIZE_AI_WORKSPACE_ROOT || process.cwd(),
    ),
    signingSecret,
    sourcePromotionEnabled,
    sourcePromotionGitCommand,
    sourcePromotionTimeoutMs: integer(
      process.env.REALIZE_AI_SOURCE_PROMOTION_TIMEOUT_MS,
      120_000,
      10_000,
      "REALIZE_AI_SOURCE_PROMOTION_TIMEOUT_MS",
    ),
    reviewModel:
      process.env.REALIZE_AI_REVIEW_MODEL ||
      process.env.REALIZE_AI_EXECUTION_MODEL ||
      process.env.REALIZE_AI_MODEL,
    reviewTimeoutMs: integer(
      process.env.REALIZE_AI_REVIEW_TIMEOUT_MS,
      10 * 60 * 1_000,
      60_000,
      "REALIZE_AI_REVIEW_TIMEOUT_MS",
    ),
    turnTimeoutMs: integer(
      process.env.REALIZE_AI_EXECUTION_TURN_TIMEOUT_MS,
      20 * 60 * 1_000,
      60_000,
      "REALIZE_AI_EXECUTION_TURN_TIMEOUT_MS",
    ),
    workerID:
      process.env.REALIZE_AI_EXECUTION_WORKER_ID ||
      `${hostname()}-${process.pid}`,
    workspaceRoot: resolve(
      process.env.REALIZE_AI_EXECUTION_WORKSPACE_ROOT ||
        `${tmpdir()}/realize-ai-workspaces`,
    ),
  };
};
