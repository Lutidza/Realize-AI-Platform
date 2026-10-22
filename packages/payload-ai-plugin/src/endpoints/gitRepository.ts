/**
 * @file packages/payload-ai-plugin/src/endpoints/gitRepository.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Читает неизменяемую Git-базу задания через общий ограниченный исполнитель.
 */

import { Git } from "@realize/git-runtime";

import { EndpointError } from "./http";

/** Returns HEAD only after verifying that the configured root is the Git owner. */
export const resolveExecutionBaseCommit = async (
  repositoryRoot: string,
): Promise<string> => {
  try {
    const git = new Git(repositoryRoot, {
      profile: "machine-read",
      timeoutMs: 2_000,
      maxOutputBytes: 16_384,
    });
    const [topLevel, commit] = await Promise.all([
      git.run(["rev-parse", "--show-toplevel"]),
      git.run(["rev-parse", "--verify", "HEAD^{commit}"]),
    ]);
    if (topLevel.trim() !== repositoryRoot) {
      throw new Error("Configured root is not the Git top-level directory.");
    }
    const value = commit.trim();
    if (!/^[a-f0-9]{40,64}$/.test(value)) throw new Error("Invalid commit.");
    return value;
  } catch {
    throw new EndpointError(
      "AI_RUNTIME_UNAVAILABLE",
      "Execution repository is unavailable or misconfigured.",
      503,
    );
  }
};
