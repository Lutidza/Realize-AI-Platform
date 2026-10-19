/**
 * @file tests/e2e/support/accessCliAcceptance.service.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Проверяет настоящий CLI device flow, keyring, статус и logout на выделенном fixture server.
 * @see documentation/architecture/platform-access.md
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { z } from "zod";
import {
  accessSessionSchema,
  userCodeSchema,
} from "@realize/payload-access-management/contracts";
import { runSecretService } from "../../../.ai/tools/task-workspace/src/auth/runSecretService.adapter.mjs";
import type {
  AccessCliAcceptanceOptions,
  AccessCliAcceptanceResult,
} from "./accessCliAcceptance.types";

const compactSchema = z.object({
  status: z.literal("completed"),
  data: z.record(z.string(), z.unknown()),
});
const noticeSchema = z.strictObject({
  authorization: z.strictObject({
    verificationUri: z.url(),
    userCode: userCodeSchema,
  }),
});

/** Секреты CLI никогда не возвращает; helper дополнительно не пишет captured streams в evidence/errors. */
export async function runAccessCliAcceptance(
  options: AccessCliAcceptanceOptions,
): Promise<AccessCliAcceptanceResult> {
  const origin = new URL(options.baseURL);
  if (
    origin.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(origin.hostname) ||
    !origin.port ||
    origin.pathname !== "/"
  )
    throw new Error(
      "CLI acceptance requires a dedicated loopback fixture origin.",
    );
  // Параметр оставлен границей fixture API; credentials/config туда не записываются.
  if (!isAbsolute(options.temporaryDirectory))
    throw new Error("Fixture temporary directory is required.");
  const baseUrl = `${origin.origin}/api/task-manager`;
  if ((await runSecretService("read", baseUrl)) !== null)
    throw new Error(
      "Fixture URL already has a saved keyring entry; no credentials were changed.",
    );
  const state = await mkdtemp(join(tmpdir(), "realize-access-cli-"));
  await chmod(state, 0o700);
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const entry = join(
    root,
    ".ai/tools/task-workspace/src/cli/runWorkspaceCommand.controller.mjs",
  );
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", XDG_STATE_HOME: state };
  for (const name of [
    "HOME",
    "PATH",
    "DBUS_SESSION_BUS_ADDRESS",
    "XDG_RUNTIME_DIR",
    "DISPLAY",
    "WAYLAND_DISPLAY",
    "XAUTHORITY",
    "LANG",
  ])
    if (process.env[name]) env[name] = process.env[name];

  const run = (args: string[], onCode?: (code: string) => Promise<void>) => {
    const child = spawn(
      process.execPath,
      ["--import=tsx/esm", entry, ...args, "--compact"],
      { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let line = "";
    let bytes = 0;
    let invalid = false;
    let announced = false;
    let approval: Promise<void> = Promise.resolve();
    const timer = setTimeout(() => {
      invalid = true;
      child.kill("SIGTERM");
    }, 90000);
    const watchdog = setTimeout(() => child.kill("SIGKILL"), 110000);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 131072) {
        invalid = true;
        child.kill("SIGTERM");
      } else stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 131072) {
        invalid = true;
        child.kill("SIGTERM");
        return;
      }
      line += chunk.toString("utf8");
      const lines = line.split("\n");
      line = lines.pop() ?? "";
      for (const item of lines) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(item);
        } catch {
          continue;
        }
        const notice = noticeSchema.safeParse(parsed);
        if (!notice.success || !onCode || announced) continue;
        if (
          notice.data.authorization.verificationUri !==
          `${origin.origin}/system/access/device`
        ) {
          invalid = true;
          child.kill("SIGTERM");
          continue;
        }
        announced = true;
        let deadline: ReturnType<typeof setTimeout>;
        approval = Promise.race([
          onCode(notice.data.authorization.userCode),
          new Promise<void>((_, reject) => {
            deadline = setTimeout(
              () => reject(new Error("Browser approval deadline exceeded.")),
              60000,
            );
          }),
        ])
          .catch(() => {
            invalid = true;
            child.kill("SIGTERM");
          })
          .finally(() => clearTimeout(deadline));
      }
    });
    const completion = new Promise<z.infer<typeof compactSchema>>(
      (resolveResult, reject) => {
        child.on("error", () => {
          clearTimeout(timer);
          clearTimeout(watchdog);
          reject(new Error("CLI acceptance process failed."));
        });
        child.on("close", async (code) => {
          clearTimeout(timer);
          clearTimeout(watchdog);
          await approval;
          if (code !== 0 || invalid || (onCode && !announced)) {
            reject(new Error("CLI acceptance command did not complete."));
            return;
          }
          let value: unknown;
          try {
            value = JSON.parse(stdout);
          } catch {
            reject(new Error("CLI acceptance response is invalid."));
            return;
          }
          const parsed = compactSchema.safeParse(value);
          if (!parsed.success) {
            reject(new Error("CLI acceptance response is invalid."));
            return;
          }
          resolveResult(parsed.data);
        });
      },
    );
    return { child, completion };
  };

  let login: ReturnType<typeof run> | undefined;
  let loggedOut = false;
  try {
    login = run(
      [
        "login",
        "--url",
        baseUrl,
        "--name",
        "Isolated CLI browser acceptance",
        "--no-browser",
      ],
      options.approve,
    );
    const connected = await login.completion;
    if (connected.data.status !== "authenticated")
      throw new Error("CLI login metadata is invalid.");
    const status = await run(["auth-status"]).completion;
    if (
      status.data.status !== "authenticated" ||
      status.data.source !== "keyring" ||
      !accessSessionSchema.safeParse({
        actor: status.data.actor,
        token: status.data.token,
      }).success
    )
      throw new Error("CLI did not load an authenticated keyring session.");
    const projects = await run(["projects"]).completion;
    if (!Array.isArray(projects.data.items))
      throw new Error("CLI project discovery failed.");
    const logout = await run(["logout"]).completion;
    if (
      logout.data.status !== "logged_out" ||
      logout.data.remoteRevoked !== true
    )
      throw new Error("CLI remote logout was not confirmed.");
    loggedOut = true;
    return {
      login: "authenticated",
      status: "authenticated",
      projects: "completed",
      logout: "logged_out",
      remoteRevoked: true,
    };
  } finally {
    if (
      login &&
      login.child.exitCode === null &&
      login.child.signalCode === null
    ) {
      const ended = once(login.child, "close");
      const force = setTimeout(() => login?.child.kill("SIGKILL"), 20000);
      login.child.kill("SIGINT");
      await ended;
      clearTimeout(force);
    }
    if (!loggedOut) {
      try {
        await run(["logout", "--url", baseUrl]).completion;
      } catch {
        /* fixture cancellation/TTL обеспечивает серверный cleanup после failure. */
      }
    }
    try {
      await runSecretService("remove", baseUrl);
    } finally {
      await rm(state, { recursive: true, force: true });
    }
  }
}
