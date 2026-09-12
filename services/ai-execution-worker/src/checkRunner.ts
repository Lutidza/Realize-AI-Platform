/**
 * @file services/ai-execution-worker/src/checkRunner.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Запускает разрешённые проверки с запретом runtime агентов в дочернем окружении.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

import { EXECUTION_CHECK_COMMANDS } from "@realize/change-engine";

import type { WorkerCheckResult } from "./types";

type Command = { args: string[]; binary: string };

const COMMANDS: Record<string, Command> = {
  "node scripts/security/check-secrets.mjs": {
    args: ["scripts/security/check-secrets.mjs"],
    binary: "node",
  },
  "npm run build": { args: ["run", "build"], binary: "npm" },
  "npm run format:check": { args: ["run", "format:check"], binary: "npm" },
  "npm run lint": { args: ["run", "lint"], binary: "npm" },
  "npm run payload:migrate:status": {
    args: ["run", "payload:migrate:status"],
    binary: "npm",
  },
  "npm run test:e2e": { args: ["run", "test:e2e"], binary: "npm" },
  "npm run test:int": { args: ["run", "test:int"], binary: "npm" },
  "npm run typecheck": { args: ["run", "typecheck"], binary: "npm" },
};

if (EXECUTION_CHECK_COMMANDS.some((command) => !COMMANDS[command])) {
  throw new Error("Execution check registry and runner are out of sync.");
}

const sanitize = (value: string, roots: string[]): string => {
  let output = value;
  for (const root of roots) output = output.replaceAll(root, "[workspace]");
  return output
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, "[redacted-token]")
    .replace(/\bgh[oprsu]_[A-Za-z0-9]{30,}\b/g, "[redacted-token]")
    .slice(-8_000);
};

const SAFE_ENVIRONMENT_NAMES = [
  "DATABASE_URI",
  "DATABASE_URL",
  "HOME",
  "LANG",
  "LC_ALL",
  "NEXT_PUBLIC_SERVER_URL",
  "NEXT_PUBLIC_SITE_URL",
  "PATH",
  "PAYLOAD_PUBLIC_SERVER_URL",
  "PAYLOAD_PUBLIC_SITE_URL",
  "PAYLOAD_SECRET",
  "POSTGRES_SSL",
  "PREVIEW_SECRET",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
] as const;

const createCheckEnvironment = (
  overrides: Partial<NodeJS.ProcessEnv> = {},
): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {
    CI: "true",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "test",
    REALIZE_BUILD_WITHOUT_DATABASE: "true",
  };
  for (const name of SAFE_ENVIRONMENT_NAMES) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  return { ...environment, ...overrides, REALIZE_AI_RUNTIME_ISOLATED: "true" };
};

/** Executes one allowlisted argv tuple without shell interpolation. */
export const runExecutionCheck = async (input: {
  command: string;
  environment?: Partial<NodeJS.ProcessEnv>;
  repositoryRoot: string;
  timeoutMs?: number;
  workspace: string;
}): Promise<WorkerCheckResult> => {
  const definition = COMMANDS[input.command];
  if (!definition)
    throw new Error(`Check is not allowlisted: ${input.command}`);
  const started = new Date();
  const environment = createCheckEnvironment({
    ...input.environment,
    NODE_ENV:
      input.environment?.NODE_ENV ||
      (input.command === "npm run build" ? "production" : "test"),
  });
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const append = (chunk: Buffer | string): void => {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += value.byteLength;
    chunks.push(value);
    while (chunks.length > 1 && totalBytes > 256 * 1024) {
      totalBytes -= chunks.shift()!.byteLength;
    }
  };

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(definition.binary, definition.args, {
      cwd: input.workspace,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
    const timeout = setTimeout(
      () => {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
      },
      input.timeoutMs || 10 * 60 * 1_000,
    );
    timeout.unref();
    child.once("exit", () => clearTimeout(timeout));
  });
  const finished = new Date();
  const rawOutput = Buffer.concat(chunks).toString("utf8");
  const status = exitCode === 0 ? "passed" : "failed";
  return {
    command: input.command,
    durationMs: finished.getTime() - started.getTime(),
    evidenceHash: createHash("sha256")
      .update(JSON.stringify([input.command, status, rawOutput]))
      .digest("hex"),
    finishedAt: finished.toISOString(),
    outputSummary: sanitize(rawOutput, [input.repositoryRoot, input.workspace]),
    startedAt: started.toISOString(),
    status,
  };
};
