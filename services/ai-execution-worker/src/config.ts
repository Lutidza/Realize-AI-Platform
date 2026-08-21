/**
 * @file services/ai-execution-worker/src/config.ts
 * @version 2026-08-21
 * @description Validates local execution, review and preview runtime configuration.
 */

import { hostname, tmpdir } from "node:os";
import { resolve } from "node:path";

/** Fully validated process configuration for one local worker instance. */
export type ExecutionWorkerConfig = {
  databaseURL: string;
  model?: string;
  pollIntervalMs: number;
  previewEnabled: boolean;
  previewHost: "127.0.0.1";
  previewPortMax: number;
  previewPortMin: number;
  previewRoot: string;
  previewStartupTimeoutMs: number;
  promotionWorkspaceRoot: string;
  repositoryRoot: string;
  reviewModel?: string;
  reviewTimeoutMs: number;
  signingSecret: string;
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

/** Reads environment variables and fails before connecting to persistence. */
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

  return {
    databaseURL,
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
    repositoryRoot: resolve(
      process.env.REALIZE_AI_WORKSPACE_ROOT || process.cwd(),
    ),
    signingSecret,
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
