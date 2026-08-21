/**
 * @file tests/int/execution-worktree.int.spec.ts
 * @version 2026-08-21
 * @description Verifies isolated branch creation and post-agent path enforcement.
 */

import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { ClaimedExecutionJob } from "../../services/ai-execution-worker/src/types";
import {
  captureWorktreeDiff,
  createExecutionWorktree,
  WorktreePolicyError,
} from "../../services/ai-execution-worker/src/worktree";
import { afterEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const temporaryRoots: string[] = [];

const git = async (cwd: string, args: string[]): Promise<string> =>
  (
    await execute("git", args, {
      cwd,
      encoding: "utf8",
    })
  ).stdout.trim();

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { force: true, recursive: true });
  }
});

describe("execution worktree policy", () => {
  it("captures an allowed diff and blocks a second out-of-scope file", async () => {
    const root = await mkdtemp(join(tmpdir(), "realize-worker-test-"));
    temporaryRoots.push(root);
    const repositoryRoot = join(root, "repository");
    const workspaceRoot = join(root, "workspaces");
    await mkdir(join(repositoryRoot, "src/components"), { recursive: true });
    await git(root, ["init", repositoryRoot]);
    await git(repositoryRoot, ["config", "user.email", "worker@example.test"]);
    await git(repositoryRoot, ["config", "user.name", "Worker Test"]);
    await writeFile(
      join(repositoryRoot, "src/components/example.ts"),
      "export const value = 1;\n",
    );
    await git(repositoryRoot, ["add", "."]);
    await git(repositoryRoot, ["commit", "-m", "baseline"]);
    const baseCommit = await git(repositoryRoot, ["rev-parse", "HEAD"]);
    const job = {
      allowedPaths: ["src/components/example.ts"],
      approvedVersion: 1,
      artifactsExpireAt: "2099-01-01T00:00:00.000Z",
      baseCommit,
      branch: "ai/change-worktree-test",
      capability: {} as ClaimedExecutionJob["capability"],
      capabilityTokenHash: "a".repeat(64),
      changeRequestID: 1,
      checks: [],
      executionKey: "execution-worktree-test",
      id: 1,
      originalRequest: "Update value",
      plan: "Update the exact file",
      planHash: "b".repeat(64),
      scopeHash: "c".repeat(64),
      workspaceID: "change-worktree-test",
    } satisfies ClaimedExecutionJob;
    const workspace = await createExecutionWorktree({
      job,
      repositoryRoot,
      workspaceRoot,
    });
    await writeFile(
      join(workspace, "src/components/example.ts"),
      "export const value = 2;\n",
    );
    const diff = await captureWorktreeDiff(workspace, job);
    expect(diff.changedPaths).toEqual(["src/components/example.ts"]);
    expect(diff.diff).toContain("value = 2");
    expect(diff.diffHash).toMatch(/^[a-f0-9]{64}$/);

    await writeFile(join(workspace, "forbidden.ts"), "export {};\n");
    await expect(captureWorktreeDiff(workspace, job)).rejects.toBeInstanceOf(
      WorktreePolicyError,
    );
  });
});
