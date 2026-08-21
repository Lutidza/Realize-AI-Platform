/**
 * @file services/ai-execution-worker/src/promotionWorktree.ts
 * @owner services/ai-execution-worker
 * @purpose Applies an accepted diff exactly and creates its isolated preview commit.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import { pathMatchesExecutionScope } from "@realize/change-engine";

import type { ClaimedPreviewDeployment, PromotionCommit } from "./previewTypes";
import { createBoundWorktree, runGit, WorktreePolicyError } from "./worktree";

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const gitWithInput = async (
  cwd: string,
  args: string[],
  input: string,
): Promise<void> => {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: {
        HOME: process.env.HOME,
        LANG: process.env.LANG || "C.UTF-8",
        NODE_ENV: process.env.NODE_ENV || "development",
        PATH: process.env.PATH,
      },
      stdio: ["pipe", "ignore", "pipe"] as const,
    });
    const errors: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", reject);
    child.on("exit", (code: number | null) => {
      if (code === 0) resolvePromise();
      else {
        reject(
          new WorktreePolicyError(
            `git apply rejected the accepted diff: ${Buffer.concat(errors)
              .toString("utf8")
              .slice(-1_000)}`,
          ),
        );
      }
    });
    child.stdin.end(input);
  });
};

const zeroSeparated = (value: string): string[] =>
  value.split("\0").filter(Boolean).sort();

const assertPathSafety = async (
  workspace: string,
  path: string,
  allowedPaths: string[],
): Promise<void> => {
  if (
    path.startsWith("/") ||
    path.includes("\0") ||
    path.split("/").includes("..") ||
    !pathMatchesExecutionScope(path, allowedPaths)
  ) {
    throw new WorktreePolicyError(
      `Accepted diff contains forbidden path: ${path}`,
    );
  }
  try {
    const stats = await lstat(resolve(workspace, path));
    if (stats.isSymbolicLink()) {
      throw new WorktreePolicyError(
        `Accepted diff contains a symbolic link: ${path}`,
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};

/** Creates a clean promotion worktree and applies the stored diff byte-for-byte. */
export const preparePromotionWorktree = async (input: {
  job: ClaimedPreviewDeployment;
  repositoryRoot: string;
  workspaceRoot: string;
}): Promise<string> => {
  if (sha256(input.job.diff) !== input.job.sourceDiffHash) {
    throw new WorktreePolicyError(
      "Stored diff content no longer matches its hash.",
    );
  }
  const workspace = await createBoundWorktree({
    baseCommit: input.job.baseCommit,
    branch: input.job.branch,
    repositoryRoot: input.repositoryRoot,
    workspaceID: input.job.workspaceID,
    workspaceRoot: input.workspaceRoot,
  });
  try {
    await gitWithInput(
      workspace,
      ["apply", "--check", "--index", "--binary"],
      input.job.diff,
    );
    await gitWithInput(
      workspace,
      ["apply", "--index", "--binary"],
      input.job.diff,
    );
    await runGit(workspace, ["diff", "--cached", "--check", "HEAD", "--"]);

    const [head, paths, appliedDiff] = await Promise.all([
      runGit(workspace, ["rev-parse", "HEAD"]),
      runGit(workspace, [
        "diff",
        "--cached",
        "--name-only",
        "-z",
        "HEAD",
        "--",
      ]),
      runGit(workspace, [
        "diff",
        "--cached",
        "--binary",
        "--no-ext-diff",
        "HEAD",
        "--",
      ]),
    ]);
    if (head.trim() !== input.job.baseCommit) {
      throw new WorktreePolicyError(
        "Promotion worktree moved away from the bound base commit.",
      );
    }
    const actualPaths = zeroSeparated(paths);
    const expectedPaths = [...input.job.expectedPaths].sort();
    if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
      throw new WorktreePolicyError(
        "Applied diff paths differ from the accepted artifact.",
      );
    }
    for (const path of actualPaths) {
      await assertPathSafety(workspace, path, input.job.allowedPaths);
    }
    if (sha256(appliedDiff) !== input.job.sourceDiffHash) {
      throw new WorktreePolicyError(
        "Applied staged diff differs from the accepted hash.",
      );
    }
    return workspace;
  } catch (error) {
    try {
      await removePromotionWorktree({
        branch: input.job.branch,
        repositoryRoot: input.repositoryRoot,
        workspaceID: input.job.workspaceID,
        workspaceRoot: input.workspaceRoot,
      });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Promotion preparation and cleanup both failed.",
      );
    }
    throw error;
  }
};

/** Revalidates the staged artifact and creates one service-identity commit. */
export const commitPromotion = async (input: {
  job: ClaimedPreviewDeployment;
  workspace: string;
}): Promise<PromotionCommit> => {
  const stagedDiff = await runGit(input.workspace, [
    "diff",
    "--cached",
    "--binary",
    "--no-ext-diff",
    "HEAD",
    "--",
  ]);
  if (sha256(stagedDiff) !== input.job.sourceDiffHash) {
    throw new WorktreePolicyError(
      "Staged diff changed after validation or review.",
    );
  }
  const stagedTree = (await runGit(input.workspace, ["write-tree"])).trim();
  await runGit(input.workspace, [
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "user.name=Realize AI Preview Service",
    "-c",
    "user.email=preview-service@realize.invalid",
    "commit",
    "--no-gpg-sign",
    "--no-verify",
    "-m",
    `chore(ai): preview change ${input.job.changeRequestID}`,
  ]);
  const [commitSHA, treeHash, parent, status] = await Promise.all([
    runGit(input.workspace, ["rev-parse", "HEAD"]),
    runGit(input.workspace, ["rev-parse", "HEAD^{tree}"]),
    runGit(input.workspace, ["rev-parse", "HEAD^"]),
    runGit(input.workspace, ["status", "--porcelain", "--untracked-files=no"]),
  ]);
  if (
    parent.trim() !== input.job.baseCommit ||
    treeHash.trim() !== stagedTree ||
    status.trim()
  ) {
    throw new WorktreePolicyError(
      "Created commit does not match the verified staged tree.",
    );
  }
  const normalizedCommit = commitSHA.trim();
  const normalizedTree = treeHash.trim();
  const buildID = (
    await readFile(resolve(input.workspace, ".next/BUILD_ID"), "utf8")
  ).trim();
  if (!buildID) {
    throw new WorktreePolicyError("Verified build output has no BUILD_ID.");
  }
  return {
    artifactHash: sha256(
      JSON.stringify([
        "local-git-preview",
        normalizedCommit,
        normalizedTree,
        input.job.sourceDiffHash,
        buildID,
      ]),
    ),
    commitSHA: normalizedCommit,
    treeHash: normalizedTree,
  };
};

const isInside = (owner: string, candidate: string): boolean => {
  const path = relative(owner, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
};

/** Removes only a validated preview worktree and its server-owned branch. */
export const removePromotionWorktree = async (input: {
  branch?: string;
  repositoryRoot: string;
  workspaceID: string;
  workspaceRoot: string;
}): Promise<void> => {
  if (!/^[a-z0-9-]{8,80}$/.test(input.workspaceID)) {
    throw new WorktreePolicyError("Cleanup workspace ID is invalid.");
  }
  const root = resolve(input.workspaceRoot);
  const target = resolve(root, input.workspaceID);
  if (!isInside(root, target) || target === root) {
    throw new WorktreePolicyError("Cleanup workspace escaped its owner root.");
  }
  let targetExists = true;
  try {
    await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    targetExists = false;
  }
  const repositoryRoot = resolve(input.repositoryRoot);
  if (targetExists) {
    await runGit(repositoryRoot, ["worktree", "remove", "--force", target]);
  } else {
    await runGit(repositoryRoot, ["worktree", "prune"]);
  }
  if (input.branch) {
    if (!/^ai\/preview-[a-z0-9-]{8,64}$/.test(input.branch)) {
      throw new WorktreePolicyError("Cleanup branch identity is invalid.");
    }
    const reference = `refs/heads/${input.branch}`;
    const existing = await runGit(repositoryRoot, [
      "for-each-ref",
      "--format=%(refname)",
      reference,
    ]);
    if (existing.trim() === reference) {
      await runGit(repositoryRoot, ["branch", "-D", "--", input.branch]);
    }
  }
};
