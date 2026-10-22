/**
 * @file tests/int/fixtures/disposableGit.fixture.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Подготавливает одноразовые Git-репозитории тестов отдельно от проверяемого исполнителя.
 */
import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** Допускает setup только внутри системного tmp, без пользовательских config и templates. */
export const disposableGitFixture = (root: string) => ({
  async run(
    args: string[],
    options?: { env?: Record<string, string> },
  ): Promise<string> {
    const actual = await realpath(root);
    const temporary = await realpath(tmpdir());
    if (actual !== resolve(root) || !actual.startsWith(`${temporary}${sep}`)) {
      throw new Error(
        "Disposable Git fixture requires an owned temporary directory.",
      );
    }
    const { stdout } = await execute("git", ["--literal-pathspecs", ...args], {
      cwd: actual,
      timeout: 5_000,
      maxBuffer: 4 * 1024 * 1024,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: actual,
        LANG: "C.UTF-8",
        NODE_ENV: "test",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_TEMPLATE_DIR: "",
        GIT_TERMINAL_PROMPT: "0",
        ...options?.env,
      },
    });
    return stdout;
  },
});
