/**
 * @file services/ai-execution-worker/src/sourcePromotionGit.ts
 * @version 2026-08-28
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Публикует exact local commit в неизменяемую scoped GitHub branch без force push.
 */

import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const MAX_OUTPUT_BYTES = 64 * 1024;

type GitExecutionOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
};

export type SourcePromotionGitExecutor = (
  command: string,
  args: string[],
  options: GitExecutionOptions,
) => Promise<{ stdout: string }>;

/** Policy error, после которого автоматический retry небезопасен. */
export class SourcePromotionGitPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourcePromotionGitPolicyError";
  }
}

const executeGit: SourcePromotionGitExecutor = async (command, args, options) =>
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderrBytes = 0;
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error("GitHub branch publication timed out.")));
    }, options.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout, "utf8") > MAX_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        finish(() => reject(new Error("Git stdout exceeded the limit.")));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_OUTPUT_BYTES) child.kill("SIGKILL");
    });
    child.on("error", () =>
      finish(() =>
        reject(new Error("Configured Git executable failed to start.")),
      ),
    );
    child.on("close", (code, signal) =>
      finish(() => {
        if (code === 0) resolvePromise({ stdout });
        else
          reject(
            new Error(`Git command failed (${code ?? signal ?? "unknown"}).`),
          );
      }),
    );
  });

const repositoryFromRemote = (value: string): string => {
  const source = value.trim().replace(/\.git$/iu, "");
  const prefixes = [
    "git@github.com:",
    "ssh://git@github.com/",
    "ssh://git@github.com:22/",
    "https://github.com/",
  ];
  const prefix = prefixes.find((candidate) =>
    source.toLowerCase().startsWith(candidate),
  );
  const repository = prefix ? source.slice(prefix.length) : "";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new SourcePromotionGitPolicyError(
      "Git origin must be a credential-free GitHub repository.",
    );
  }
  return repository;
};

/** Проверяет origin/commit и создаёт remote branch только при отсутствии ref. */
export const publishExactGitHubBranch = async (
  input: {
    gitCommand: string;
    gitCommit: string;
    headBranch: string;
    repositoryRoot: string;
    repositorySlug: string;
    timeoutMs: number;
    token: string;
  },
  execute: SourcePromotionGitExecutor = executeGit,
): Promise<void> => {
  const temporaryRoot = await mkdtemp(
    resolve(tmpdir(), "realize-source-promotion-"),
  );
  try {
    const askpass = resolve(temporaryRoot, "git-askpass.sh");
    await writeFile(
      askpass,
      "#!/bin/sh\ncase \"$1\" in\n  *Username*) printf '%s\\n' 'x-access-token' ;;\n  *Password*) printf '%s\\n' \"$REALIZE_AI_GITHUB_TOKEN\" ;;\n  *) exit 1 ;;\nesac\n",
      { mode: 0o700 },
    );
    const commonEnvironment: NodeJS.ProcessEnv = {
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C.UTF-8",
      NODE_ENV: process.env.NODE_ENV || "production",
    };
    const authenticatedEnvironment: NodeJS.ProcessEnv = {
      ...commonEnvironment,
      GIT_ASKPASS: askpass,
      GIT_ASKPASS_REQUIRE: "force",
      REALIZE_AI_GITHUB_TOKEN: input.token,
    };
    const options = {
      cwd: input.repositoryRoot,
      env: commonEnvironment,
      timeoutMs: input.timeoutMs,
    };
    const origin = await execute(
      input.gitCommand,
      ["remote", "get-url", "--push", "origin"],
      options,
    );
    if (
      repositoryFromRemote(origin.stdout).toLowerCase() !==
      input.repositorySlug.toLowerCase()
    ) {
      throw new SourcePromotionGitPolicyError(
        "Configured GitHub repository differs from Git origin.",
      );
    }
    const local = await execute(
      input.gitCommand,
      ["rev-parse", `${input.gitCommit}^{commit}`],
      options,
    );
    if (local.stdout.trim() !== input.gitCommit) {
      throw new SourcePromotionGitPolicyError(
        "Preview commit is not available in the trusted repository.",
      );
    }

    const remoteURL = `https://github.com/${input.repositorySlug}.git`;
    const reference = `refs/heads/${input.headBranch}`;
    const authenticatedOptions = {
      ...options,
      env: authenticatedEnvironment,
    };
    const readRemote = async (): Promise<string> => {
      const remote = await execute(
        input.gitCommand,
        [
          "-c",
          "core.hooksPath=/dev/null",
          "-c",
          "credential.helper=",
          "-c",
          "http.proxy=",
          "ls-remote",
          "--refs",
          remoteURL,
          reference,
        ],
        authenticatedOptions,
      );
      return remote.stdout.trim().split(/\s+/)[0] || "";
    };
    const remoteCommit = await readRemote();
    if (remoteCommit && remoteCommit !== input.gitCommit) {
      throw new SourcePromotionGitPolicyError(
        "Source promotion branch already points to another commit.",
      );
    }
    if (!remoteCommit) {
      await execute(
        input.gitCommand,
        [
          "-c",
          "core.hooksPath=/dev/null",
          "-c",
          "credential.helper=",
          "-c",
          "http.proxy=",
          "push",
          remoteURL,
          `${input.gitCommit}:${reference}`,
        ],
        authenticatedOptions,
      );
    }
    if ((await readRemote()) !== input.gitCommit) {
      throw new SourcePromotionGitPolicyError(
        "Published GitHub branch does not resolve to the exact preview commit.",
      );
    }
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
};
