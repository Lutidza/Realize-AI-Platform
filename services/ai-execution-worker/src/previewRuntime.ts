/**
 * @file services/ai-execution-worker/src/previewRuntime.ts
 * @version 1.0.1
 * @date 2026-09-17
 * @description Запускает изолированный loopback preview с копией БД и запретом AI runtime.
 * @owner services/ai-execution-worker
 * @purpose Starts and safely stops an exact-build loopback preview with a sanitized DB clone.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cp, mkdir, open, readFile, readlink, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join, relative, resolve, sep } from "node:path";

import type { ExecutionWorkerConfig } from "./config";
import { clonePreviewDatabase, dropPreviewDatabase } from "./previewDatabase";
import type {
  ClaimedPreviewDeployment,
  LocalPreviewRuntime,
  PromotionCommit,
} from "./previewTypes";
import { WorktreePolicyError } from "./worktree";

const isInside = (owner: string, candidate: string): boolean => {
  const path = relative(owner, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
};

const wait = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
};

const canListen = async (host: string, port: number): Promise<boolean> =>
  await new Promise<boolean>((resolvePromise) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolvePromise(false));
    server.listen({ host, port }, () => {
      server.close(() => resolvePromise(true));
    });
  });

const findPort = async (config: ExecutionWorkerConfig): Promise<number> => {
  for (
    let port = config.previewPortMin;
    port <= config.previewPortMax;
    port += 1
  ) {
    if (await canListen(config.previewHost, port)) return port;
  }
  throw new Error("No loopback preview port is available.");
};

const waitForReadiness = async (
  previewURL: string,
  timeoutMs: number,
): Promise<string> => {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "unreachable";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${previewURL}/api/health/ready`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(3_000),
      });
      lastStatus = `${response.status} ${response.statusText}`;
      if (response.ok) {
        const payload = (await response.json()) as Record<string, unknown>;
        if (payload.status === "ready") {
          return `Readiness passed at ${previewURL}; release=${String(payload.release || "preview")}.`;
        }
      }
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : "unreachable";
    }
    await wait(500);
  }
  throw new Error(`Preview readiness timed out: ${lastStatus}`);
};

const previewEnvironment = (input: {
  commit: PromotionCommit;
  databaseURL: string;
  host: string;
  port: number;
  previewURL: string;
}): NodeJS.ProcessEnv => ({
  DATABASE_URI: input.databaseURL,
  DATABASE_URL: input.databaseURL,
  HOSTNAME: input.host,
  LANG: process.env.LANG || "C.UTF-8",
  NEXT_PUBLIC_SERVER_URL: input.previewURL,
  NEXT_PUBLIC_SITE_URL: input.previewURL,
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_ENV: "production",
  PATH: process.env.PATH,
  PAYLOAD_DB_PUSH: "false",
  PAYLOAD_PUBLIC_SERVER_URL: input.previewURL,
  PAYLOAD_PUBLIC_SITE_URL: input.previewURL,
  PAYLOAD_SECRET: randomBytes(32).toString("base64url"),
  PORT: String(input.port),
  POSTGRES_SSL: process.env.POSTGRES_SSL || "false",
  PREVIEW_SECRET: randomBytes(32).toString("base64url"),
  REALIZE_AI_RUNTIME_ISOLATED: "true",
  RELEASE_ID: `preview-${input.commit.commitSHA.slice(0, 12)}`,
});

const safeRuntimeRoot = (input: {
  config: ExecutionWorkerConfig;
  workspaceID: string;
}): string => {
  if (!/^[a-z0-9-]{8,80}$/.test(input.workspaceID)) {
    throw new WorktreePolicyError("Preview runtime workspace ID is invalid.");
  }
  const owner = resolve(input.config.previewRoot);
  const candidate = resolve(owner, input.workspaceID);
  const repository = resolve(input.config.repositoryRoot);
  if (
    candidate === owner ||
    !isInside(owner, candidate) ||
    isInside(repository, owner) ||
    isInside(owner, repository)
  ) {
    throw new WorktreePolicyError("Preview runtime root is not isolated.");
  }
  return candidate;
};

/** Starts a standalone Next build against a new sanitized database clone. */
export const startLocalPreview = async (input: {
  commit: PromotionCommit;
  config: ExecutionWorkerConfig;
  job: ClaimedPreviewDeployment;
  targetPath: string;
  workspace: string;
}): Promise<LocalPreviewRuntime> => {
  const runtimeRoot = safeRuntimeRoot({
    config: input.config,
    workspaceID: input.job.workspaceID,
  });
  await mkdir(runtimeRoot, { mode: 0o700, recursive: true });
  const databaseName = `realize_ai_preview_${input.job.id}_${input.job.deploymentKey
    .replaceAll("-", "")
    .slice(0, 8)}`;
  const cloned = await clonePreviewDatabase({
    databaseName,
    databaseURL: input.config.databaseURL,
    runtimeRoot,
  });
  let processID: number | undefined;
  try {
    const standalone = resolve(input.workspace, ".next/standalone");
    const serverFile = resolve(standalone, "server.js");
    const publicSource = resolve(input.workspace, "public");
    const publicTarget = resolve(standalone, "public");
    const staticSource = resolve(input.workspace, ".next/static");
    const staticTarget = resolve(standalone, ".next/static");
    if (
      !isInside(input.workspace, standalone) ||
      !isInside(standalone, serverFile)
    ) {
      throw new WorktreePolicyError(
        "Standalone preview artifact escaped its worktree.",
      );
    }
    await cp(publicSource, publicTarget, { force: true, recursive: true });
    await cp(staticSource, staticTarget, { force: true, recursive: true });
    const port = await findPort(input.config);
    const origin = `http://${input.config.previewHost}:${port}`;
    const previewURL = new URL(input.targetPath, origin).href;
    const log = await open(join(runtimeRoot, "preview.log"), "a", 0o600);
    const child = spawn(process.execPath, [serverFile], {
      cwd: standalone,
      detached: true,
      env: previewEnvironment({
        commit: input.commit,
        databaseURL: cloned.databaseURL,
        host: input.config.previewHost,
        port,
        previewURL: origin,
      }),
      stdio: ["ignore", log.fd, log.fd],
    });
    child.unref();
    processID = child.pid;
    await log.close();
    if (!processID) throw new Error("Preview process did not receive a PID.");
    const healthSummary = await waitForReadiness(
      origin,
      input.config.previewStartupTimeoutMs,
    );
    return {
      databaseName: cloned.databaseName,
      databaseURL: cloned.databaseURL,
      healthSummary,
      port,
      previewURL,
      processID,
    };
  } catch (error) {
    if (processID) {
      try {
        process.kill(-processID, "SIGKILL");
      } catch (killError) {
        if ((killError as NodeJS.ErrnoException).code !== "ESRCH") {
          console.error(
            `[ai-execution-worker] failed to stop unhealthy preview process=${processID}`,
          );
        }
      }
    }
    await dropPreviewDatabase(input.config.databaseURL, cloned.databaseName);
    await rm(runtimeRoot, { force: true, recursive: true });
    throw error;
  }
};

const processBelongsToWorkspace = async (
  processID: number,
  workspace: string,
): Promise<boolean> => {
  try {
    const [cwd, command] = await Promise.all([
      readlink(`/proc/${processID}/cwd`),
      readFile(`/proc/${processID}/cmdline`, "utf8"),
    ]);
    const normalizedCommand = command.replaceAll("\0", " ").trim();
    return (
      isInside(resolve(workspace), resolve(cwd)) &&
      (normalizedCommand.includes("server.js") ||
        normalizedCommand.startsWith("next-server"))
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

/** Stops only a process proven to belong to the exact promotion worktree. */
export const stopLocalPreviewProcess = async (
  processID: number | undefined,
  workspace: string,
): Promise<void> => {
  if (!processID || !Number.isInteger(processID) || processID < 2) return;
  if (!(await processBelongsToWorkspace(processID, workspace))) return;
  try {
    process.kill(-processID, "SIGTERM");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    throw error;
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await wait(250);
    try {
      process.kill(processID, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
      throw error;
    }
  }
  process.kill(-processID, "SIGKILL");
};

/** Removes one validated runtime directory after its process and DB are gone. */
export const removePreviewRuntimeFiles = async (input: {
  config: ExecutionWorkerConfig;
  workspaceID: string;
}): Promise<void> => {
  await rm(safeRuntimeRoot(input), { force: true, recursive: true });
};
