/**
 * @file .ai/tools/git-delivery/test/fixtures/FixtureGit.adapter.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Создаёт disposable Git fixtures и берёт настоящий общий lease для их адресных изменений.
 */
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import {
  Git,
  requiresGitLock,
  withGitRepositoryLock,
} from "@realize/git-runtime";
import type { GitLock, GitRunOptions } from "@realize/git-runtime";

const execute = promisify(execFile);

/** Только test-owned tmp; init/clone подготавливают fixture до появления git-common-dir. */
export class FixtureGit extends Git {
  private fixtureLease?: GitLock;

  /** Явно моделирует чужую гонку или local-file transport только внутри disposable fixture. */
  async runUncoordinatedFixture(args: readonly string[]): Promise<string> {
    const path = relative(resolve(tmpdir()), resolve(this.root));
    if (!path || path === ".." || path.startsWith(`..${sep}`))
      throw new Error("External fixture process requires temporary ownership.");
    const result = await execute(
      "git",
      ["-c", "core.hooksPath=/dev/null", ...args],
      {
        cwd: this.root,
        encoding: "utf8",
        timeout: 15000,
        maxBuffer: 4 * 1024 * 1024,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: "test",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_TERMINAL_PROMPT: "0",
          GIT_ALLOW_PROTOCOL: "file",
        },
      },
    );
    return result.stdout;
  }

  override attachLock(lease: GitLock): void {
    super.attachLock(lease);
    this.fixtureLease = lease;
  }

  override detachLock(): void {
    this.fixtureLease = undefined;
    super.detachLock();
  }

  override async runBytes(
    args: readonly string[],
    options: GitRunOptions = {},
  ): Promise<Buffer> {
    const path = relative(resolve(tmpdir()), resolve(this.root));
    if (!path || path === ".." || path.startsWith(`..${sep}`))
      throw new Error(
        "Fixture Git is restricted to a disposable temporary directory.",
      );
    if (["init", "clone"].includes(args[0])) {
      const result = await execute(
        "git",
        ["-c", "core.hooksPath=/dev/null", ...args],
        {
          cwd: this.root,
          encoding: "buffer",
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            NODE_ENV: "test",
            GIT_CONFIG_GLOBAL: "/dev/null",
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_TERMINAL_PROMPT: "0",
            GIT_ALLOW_PROTOCOL: "file",
          },
        },
      );
      return result.stdout;
    }
    if (options.machineRead || !requiresGitLock(args) || this.fixtureLease)
      return super.runBytes(args, options);
    return withGitRepositoryLock(
      { repositoryRoot: this.root },
      async (lease) => {
        this.attachLock(lease);
        try {
          return await super.runBytes(args, options);
        } finally {
          this.detachLock();
        }
      },
    );
  }
}
