/**
 * @file packages/payload-ai-plugin/src/endpoints/gitRepository.ts
 * @version 2026-08-21
 * @description Resolves the immutable Git base used when an execution job is enqueued.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { EndpointError } from "./http";

const execute = promisify(execFile);

/** Returns HEAD only after verifying that the configured root is the Git owner. */
export const resolveExecutionBaseCommit = async (
  repositoryRoot: string,
): Promise<string> => {
  try {
    const [{ stdout: topLevel }, { stdout: commit }] = await Promise.all([
      execute("git", ["rev-parse", "--show-toplevel"], {
        cwd: repositoryRoot,
        encoding: "utf8",
      }),
      execute("git", ["rev-parse", "--verify", "HEAD^{commit}"], {
        cwd: repositoryRoot,
        encoding: "utf8",
      }),
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
