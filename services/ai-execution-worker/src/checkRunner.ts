/**
 * @file services/ai-execution-worker/src/checkRunner.ts
 * @version 1.2.0
 * @date 2026-09-15
 * @description Запускает разрешённые проверки с ограниченным build parallelism и диагностикой завершения процесса.
 * @see documentation/delivery/01-local-admin-ai.md
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

import { EXECUTION_CHECK_COMMANDS } from "@realize/change-engine";

import type { WorkerCheckResult } from "./types";
import { sanitizeExecutionOutput } from "./sanitizeExecutionOutput.util";

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

/** Запускает разрешённую argv-команду без shell и завершает её группу процессов при timeout. */
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
  if (input.command === "npm run build") {
    // Подтверждено для Next 16.3.1/Turbopack; это ограничение потоков, а не общий лимит памяти.
    environment.TURBO_TASKS_AVAILABLE_PARALLELISM = "2";
  }
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

  let exitCode: number | null = null;
  let signal: NodeJS.Signals | null = null;
  let timedOut = false;
  await new Promise<void>((resolve, reject) => {
    const processGroup = process.platform !== "win32";
    const child = spawn(definition.binary, definition.args, {
      cwd: input.workspace,
      env: environment,
      detached: processGroup,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let closed = false;
    let cleanupPending = false;
    let settled = false;
    let processError: Error | undefined;
    let escalation: ReturnType<typeof setTimeout> | undefined;
    const finish = (): void => {
      if (settled || !closed || cleanupPending) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(escalation);
      if (processError) reject(processError);
      else resolve();
    };
    const terminate = (terminationSignal: NodeJS.Signals): void => {
      try {
        if (processGroup && child.pid && child.pid > 0) {
          process.kill(-child.pid, terminationSignal);
        } else {
          // Windows не поддерживает POSIX process groups: fallback завершает только корневой процесс.
          child.kill(terminationSignal);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH")
          processError = new Error("Не удалось завершить процесс проверки.");
      }
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", (error) => {
      processError = error;
    });
    // close приходит после закрытия stdout/stderr; exit может предшествовать последнему выводу.
    child.once("close", (code, terminationSignal) => {
      exitCode = code;
      signal = terminationSignal;
      closed = true;
      finish();
    });
    const timeout = setTimeout(
      () => {
        timedOut = true;
        cleanupPending = true;
        terminate("SIGTERM");
        // npm может выйти раньше игнорирующего SIGTERM потомка; grace не отменяется его close.
        escalation = setTimeout(() => {
          terminate("SIGKILL");
          cleanupPending = false;
          finish();
        }, 2_000);
        // Cleanup удерживает event loop даже после раннего close корневого процесса.
      },
      input.timeoutMs || 10 * 60 * 1_000,
    );
    timeout.unref();
  });
  const finished = new Date();
  const rawOutput = Buffer.concat(chunks).toString("utf8");
  const status = exitCode === 0 && !signal && !timedOut ? "passed" : "failed";
  const termination = { exitCode, signal, timedOut };
  const diagnostic =
    status === "failed"
      ? `\n[execution-check] exitCode=${exitCode ?? "null"}; signal=${signal ?? "none"}; timedOut=${timedOut}`
      : "";
  return {
    command: input.command,
    durationMs: finished.getTime() - started.getTime(),
    evidenceHash: createHash("sha256")
      .update(JSON.stringify([input.command, status, rawOutput, termination]))
      .digest("hex"),
    finishedAt: finished.toISOString(),
    outputSummary: sanitizeExecutionOutput(
      rawOutput + diagnostic,
      [input.repositoryRoot, input.workspace],
      "check",
    ),
    startedAt: started.toISOString(),
    status,
  };
};
