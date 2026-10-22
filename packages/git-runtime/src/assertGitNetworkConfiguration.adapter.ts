/**
 * @file packages/git-runtime/src/assertGitNetworkConfiguration.adapter.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Отклоняет Git config, способный подменить сетевое назначение или явную авторизацию.
 */

import { GitFailure } from "./GitFailure.error.ts";
import type { Git } from "./Git.adapter.ts";
import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Scope config сохраняется, включая hooks/signing; конфликтующие сетевые overrides не исполняются. */
export async function assertGitNetworkConfiguration(
  git: Git,
  transport: "https" | "ssh",
  prefix: readonly string[] = [],
  signal?: AbortSignal,
): Promise<void> {
  if (transport === "https") {
    for (const filename of [".netrc", "_netrc"]) {
      try {
        await lstat(join(homedir(), filename));
        throw new GitFailure(
          "git_network_configuration_denied",
          "Не допускается альтернативная HTTPS credential configuration.",
        );
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ENOENT"
        )
          continue;
        throw new GitFailure(
          "git_network_configuration_denied",
          "Не допускается альтернативная HTTPS credential configuration.",
        );
      }
    }
  }
  try {
    const matches = await git.run(
      [
        ...prefix,
        "config",
        "--null",
        "--name-only",
        "--get-regexp",
        "^(include\\.path|includeif\\..*\\.path|url\\..*\\.(insteadof|pushinsteadof)|remote\\.(https://|ssh://).*|core\\.sshcommand|http\\..*\\..*|credential\\..*\\..*|http\\.(sslcainfo|sslcapath|sslcert|sslkey|curloptresolve|sslbackend|schannelusesslcainfo))$",
      ],
      { signal },
    );
    if (matches.length)
      throw new GitFailure(
        "git_network_configuration_denied",
        "Git config конфликтует с разрешённым сетевым подключением.",
      );
  } catch (error) {
    if (
      error instanceof GitFailure &&
      error.code === "git_command_failed" &&
      error.exitCode === 1
    )
      return;
    throw error;
  }
}
