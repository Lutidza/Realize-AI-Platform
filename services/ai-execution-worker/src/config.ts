/**
 * @file services/ai-execution-worker/src/config.ts
 * @version 2.0.0
 * @date 2026-09-11
 * @description Проверяет execution, source/release и integration runtime configuration.
 */

import { hostname, tmpdir } from "node:os";
import { isAbsolute, resolve } from "node:path";

import type { ExecutionWorkerConfig } from "./ExecutionWorkerConfig.types";

export type { ExecutionWorkerConfig } from "./ExecutionWorkerConfig.types";

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

const orchestratorEnvironment = (
  names: string[],
  sourceEnvironment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: sourceEnvironment.NODE_ENV || "production",
  };
  for (const name of names) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
      throw new Error(
        "REALIZE_AI_RELEASE_ORCHESTRATOR_ENV_JSON contains an invalid environment variable name.",
      );
    }
    const value = sourceEnvironment[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
};

/** Проверяет инфраструктуру до подключения к БД; продуктовые переключатели читает runtime registry. */
export const readExecutionWorkerConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): ExecutionWorkerConfig => {
  if (environment.REALIZE_AI_RUNTIME_ISOLATED === "true") {
    throw new Error("Execution worker is unavailable in an isolated runtime.");
  }
  const databaseURL =
    environment.DATABASE_URI || environment.DATABASE_URL || "";
  if (!databaseURL)
    throw new Error("DATABASE_URI or DATABASE_URL is required.");
  const signingSecret = environment.REALIZE_AI_EXECUTION_SIGNING_SECRET || "";
  if (Buffer.byteLength(signingSecret, "utf8") < 32) {
    throw new Error(
      "REALIZE_AI_EXECUTION_SIGNING_SECRET must contain at least 32 bytes.",
    );
  }

  const previewHost = environment.REALIZE_AI_PREVIEW_HOST || "127.0.0.1";
  if (previewHost !== "127.0.0.1") {
    throw new Error("REALIZE_AI_PREVIEW_HOST must remain 127.0.0.1.");
  }
  const previewPortMin = integer(
    environment.REALIZE_AI_PREVIEW_PORT_MIN,
    3_200,
    1_024,
    "REALIZE_AI_PREVIEW_PORT_MIN",
  );
  const previewPortMax = integer(
    environment.REALIZE_AI_PREVIEW_PORT_MAX,
    3_299,
    previewPortMin,
    "REALIZE_AI_PREVIEW_PORT_MAX",
  );
  const sourcePromotionGitCommand =
    environment.REALIZE_AI_GITHUB_GIT_COMMAND || undefined;
  if (
    sourcePromotionGitCommand !== undefined &&
    (!isAbsolute(sourcePromotionGitCommand) ||
      sourcePromotionGitCommand.includes("\0"))
  ) {
    throw new Error(
      "REALIZE_AI_GITHUB_GIT_COMMAND must be an absolute executable path when configured.",
    );
  }
  const releaseOrchestratorCommand =
    environment.REALIZE_AI_RELEASE_ORCHESTRATOR_COMMAND || undefined;
  if (
    releaseOrchestratorCommand !== undefined &&
    (!isAbsolute(releaseOrchestratorCommand) ||
      releaseOrchestratorCommand.includes("\0"))
  ) {
    throw new Error(
      "REALIZE_AI_RELEASE_ORCHESTRATOR_COMMAND must be an absolute executable path when configured.",
    );
  }
  const releaseOrchestratorEnvNames = stringArray(
    environment.REALIZE_AI_RELEASE_ORCHESTRATOR_ENV_JSON,
    "REALIZE_AI_RELEASE_ORCHESTRATOR_ENV_JSON",
  );

  return {
    codexBinary: environment.REALIZE_CODEX_BINARY || undefined,
    databaseURL,
    integrationEncryptionKey:
      environment.REALIZE_INTEGRATIONS_ENCRYPTION_KEY || undefined,
    pollIntervalMs: integer(
      environment.REALIZE_AI_EXECUTION_POLL_MS,
      2_000,
      250,
      "REALIZE_AI_EXECUTION_POLL_MS",
    ),
    previewHost,
    previewPortMax,
    previewPortMin,
    previewRoot: resolve(
      environment.REALIZE_AI_PREVIEW_ROOT || `${tmpdir()}/realize-ai-previews`,
    ),
    previewStartupTimeoutMs: integer(
      environment.REALIZE_AI_PREVIEW_STARTUP_TIMEOUT_MS,
      120_000,
      10_000,
      "REALIZE_AI_PREVIEW_STARTUP_TIMEOUT_MS",
    ),
    promotionWorkspaceRoot: resolve(
      environment.REALIZE_AI_PROMOTION_WORKSPACE_ROOT ||
        `${tmpdir()}/realize-ai-promotion-workspaces`,
    ),
    releaseOrchestratorArgs: stringArray(
      environment.REALIZE_AI_RELEASE_ORCHESTRATOR_ARGS_JSON,
      "REALIZE_AI_RELEASE_ORCHESTRATOR_ARGS_JSON",
    ),
    releaseOrchestratorCommand,
    releaseOrchestratorEnvironment: orchestratorEnvironment(
      releaseOrchestratorEnvNames,
      environment,
    ),
    releaseTimeoutMs: integer(
      environment.REALIZE_AI_RELEASE_TIMEOUT_MS,
      30 * 60 * 1_000,
      60_000,
      "REALIZE_AI_RELEASE_TIMEOUT_MS",
    ),
    repositoryRoot: resolve(
      environment.REALIZE_AI_WORKSPACE_ROOT || process.cwd(),
    ),
    signingSecret,
    sourcePromotionGitCommand,
    sourcePromotionTimeoutMs: integer(
      environment.REALIZE_AI_SOURCE_PROMOTION_TIMEOUT_MS,
      120_000,
      10_000,
      "REALIZE_AI_SOURCE_PROMOTION_TIMEOUT_MS",
    ),
    reviewTimeoutMs: integer(
      environment.REALIZE_AI_REVIEW_TIMEOUT_MS,
      10 * 60 * 1_000,
      60_000,
      "REALIZE_AI_REVIEW_TIMEOUT_MS",
    ),
    turnTimeoutMs: integer(
      environment.REALIZE_AI_EXECUTION_TURN_TIMEOUT_MS,
      20 * 60 * 1_000,
      60_000,
      "REALIZE_AI_EXECUTION_TURN_TIMEOUT_MS",
    ),
    workerID:
      environment.REALIZE_AI_EXECUTION_WORKER_ID ||
      `${hostname()}-${process.pid}`,
    workspaceRoot: resolve(
      environment.REALIZE_AI_EXECUTION_WORKSPACE_ROOT ||
        `${tmpdir()}/realize-ai-workspaces`,
    ),
  };
};
