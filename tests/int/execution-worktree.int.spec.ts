/**
 * @file tests/int/execution-worktree.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Проверяет общий lease создания и capture worktree, scope до add -N и повторную привязку HEAD.
 */
// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { withGitRepositoryLock } from "@realize/git-runtime";
import { afterEach, describe, expect, it } from "vitest";
import type { ClaimedExecutionJob } from "../../services/ai-execution-worker/src/types";
import { createExecutionWorktree } from "../../services/ai-execution-worker/src/worktree";
import { captureWorktreeDiff } from "../../services/ai-execution-worker/src/captureWorktreeDiff.service";
import { WorktreePolicyError } from "../../services/ai-execution-worker/src/WorktreePolicy.error";

const execute = promisify(execFile);
const temporaryRoots: string[] = [];

// Git bootstrap принадлежит только одноразовым fixtures, до появления repository lock.
const git = async (cwd: string, args: string[]): Promise<string> =>
  (
    await execute(
      "git",
      ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args],
      { cwd, encoding: "utf8" },
    )
  ).stdout.trim();

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "realize-worker-test-"));
  temporaryRoots.push(root);
  const repositoryRoot = join(root, "repository");
  const workspaceRoot = join(root, "workspaces");
  await mkdir(join(repositoryRoot, "src/components"), { recursive: true });
  await git(root, ["init", "--template=", repositoryRoot]);
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
    allowedPaths: ["src/components/example.ts", "src/components/new.ts"],
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
  return { job, repositoryRoot, workspaceRoot };
};

afterEach(async () => {
  for (const root of temporaryRoots.splice(0))
    await rm(root, { force: true, recursive: true });
});

describe("execution worktree policy", () => {
  it("captures an allowed diff and rejects forbidden files before mutating the index", async () => {
    const input = await fixture();
    const workspace = await createExecutionWorktree(input);
    await writeFile(
      join(workspace, "src/components/example.ts"),
      "export const value = 2;\n",
    );
    await writeFile(
      join(workspace, "src/components/new.ts"),
      "export const added = true;\n",
    );
    const diff = await captureWorktreeDiff(workspace, input.job);
    expect(diff.changedPaths).toEqual([
      "src/components/example.ts",
      "src/components/new.ts",
    ]);
    expect(diff.diff).toContain("value = 2");
    expect(diff.diffHash).toMatch(/^[a-f0-9]{64}$/);

    await writeFile(join(workspace, "forbidden.ts"), "export {};\n");
    await expect(
      captureWorktreeDiff(workspace, input.job),
    ).rejects.toBeInstanceOf(WorktreePolicyError);
    expect(await git(workspace, ["ls-files", "--", "forbidden.ts"])).toBe("");
  });

  it("shares one common-dir lease across source/worktree and borrows it without relocking", async () => {
    const input = await fixture();
    await withGitRepositoryLock(
      { repositoryRoot: input.repositoryRoot },
      async (lease) => {
        await expect(createExecutionWorktree(input)).rejects.toMatchObject({
          code: "repository_locked",
        });
        const workspace = await createExecutionWorktree({
          ...input,
          existingLease: lease,
        });
        await writeFile(
          join(workspace, "src/components/new.ts"),
          "export const added = true;\n",
        );
        await expect(
          captureWorktreeDiff(workspace, input.job),
        ).rejects.toMatchObject({ code: "repository_locked" });
        const diff = await captureWorktreeDiff(workspace, input.job, lease);
        expect(diff.changedPaths).toEqual(["src/components/new.ts"]);
        lease.assertHeld();
        await expect(
          withGitRepositoryLock(
            { repositoryRoot: workspace },
            async () => undefined,
          ),
        ).rejects.toMatchObject({ code: "repository_locked" });
      },
    );
    await expect(
      withGitRepositoryLock(
        { repositoryRoot: input.repositoryRoot },
        async () => true,
      ),
    ).resolves.toBe(true);
  });

  it("rejects a changed HEAD when reacquiring capture after external work", async () => {
    const input = await fixture();
    const workspace = await createExecutionWorktree(input);
    await writeFile(
      join(workspace, "src/components/example.ts"),
      "export const value = 2;\n",
    );
    await git(workspace, ["add", "."]);
    await git(workspace, ["commit", "-m", "unexpected fixture commit"]);
    await expect(
      captureWorktreeDiff(workspace, input.job),
    ).rejects.toBeInstanceOf(WorktreePolicyError);
  });
});
