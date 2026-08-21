/**
 * @file tests/int/promotion-worktree.int.spec.ts
 * @owner tests/int
 * @purpose Verifies exact accepted-diff replay and isolated service commit creation.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import type { ClaimedPreviewDeployment } from "../../services/ai-execution-worker/src/previewTypes";
import {
  commitPromotion,
  preparePromotionWorktree,
  removePromotionWorktree,
} from "../../services/ai-execution-worker/src/promotionWorktree";

const execute = promisify(execFile);
const temporaryRoots: string[] = [];

const git = async (cwd: string, args: string[]): Promise<string> =>
  (
    await execute("git", args, {
      cwd,
      encoding: "utf8",
    })
  ).stdout;

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { force: true, recursive: true });
  }
});

describe("preview promotion worktree", () => {
  it("replays one exact diff and commits the verified tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "realize-promotion-test-"));
    temporaryRoots.push(root);
    const repositoryRoot = join(root, "repository");
    const workspaceRoot = join(root, "workspaces");
    const sourcePath = join(repositoryRoot, "src/components/example.ts");
    await mkdir(join(repositoryRoot, "src/components"), { recursive: true });
    await git(root, ["init", repositoryRoot]);
    await git(repositoryRoot, ["config", "user.email", "test@example.invalid"]);
    await git(repositoryRoot, ["config", "user.name", "Promotion Test"]);
    await writeFile(sourcePath, "export const value = 1;\n");
    await git(repositoryRoot, ["add", "."]);
    await git(repositoryRoot, ["commit", "-m", "baseline"]);
    const baseCommit = (
      await git(repositoryRoot, ["rev-parse", "HEAD"])
    ).trim();
    await writeFile(sourcePath, "export const value = 2;\n");
    const diff = await git(repositoryRoot, [
      "diff",
      "--binary",
      "--no-ext-diff",
      "HEAD",
      "--",
    ]);
    const sourceDiffHash = createHash("sha256").update(diff).digest("hex");
    const job = {
      allowedPaths: ["src/components/example.ts"],
      baseCommit,
      branch: "ai/preview-worktree-test",
      changeRequestID: 1,
      deploymentKey: "deployment-worktree-test",
      diff,
      executionJobID: 2,
      expectedPaths: ["src/components/example.ts"],
      expiresAt: "2099-01-01T00:00:00.000Z",
      id: 3,
      originalRequest: "Update value",
      plan: "Update the exact file",
      requiredChecks: [],
      sourceDiffHash,
      sourceEvidenceHash: "e".repeat(64),
      workspaceID: "preview-worktree-test",
    } satisfies ClaimedPreviewDeployment;

    const workspace = await preparePromotionWorktree({
      job,
      repositoryRoot,
      workspaceRoot,
    });
    expect(
      await readFile(join(workspace, "src/components/example.ts"), "utf8"),
    ).toContain("value = 2");
    await mkdir(join(workspace, ".next"), { recursive: true });
    await writeFile(join(workspace, ".next/BUILD_ID"), "test-build-id\n");
    const commit = await commitPromotion({ job, workspace });
    expect(commit.commitSHA).toMatch(/^[a-f0-9]{40}$/);
    expect(commit.treeHash).toMatch(/^[a-f0-9]{40}$/);
    expect(commit.artifactHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await git(workspace, ["rev-parse", "HEAD^"])).trim()).toBe(
      baseCommit,
    );
    await removePromotionWorktree({
      branch: job.branch,
      repositoryRoot,
      workspaceID: job.workspaceID,
      workspaceRoot,
    });
    expect(
      (await git(repositoryRoot, ["branch", "--list", job.branch])).trim(),
    ).toBe("");
  });
});
