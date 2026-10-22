/**
 * @file tests/int/promotion-worktree.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Проверяет exact replay, короткие общие locks, повторную проверку artifact и служебную identity preview commit.
 */
// @vitest-environment node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { withGitRepositoryLock } from "@realize/git-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClaimedPreviewDeployment } from "../../services/ai-execution-worker/src/previewTypes";
import { preparePromotionWorktree } from "../../services/ai-execution-worker/src/promotionWorktree";
import { commitPromotion } from "../../services/ai-execution-worker/src/commitPromotion.service";
import { removePromotionWorktree } from "../../services/ai-execution-worker/src/removePromotionWorktree.service";
import { readVerifiedPromotionDiff } from "../../services/ai-execution-worker/src/readVerifiedPromotionDiff.service";
import { WorktreePolicyError } from "../../services/ai-execution-worker/src/WorktreePolicy.error";

const execute = promisify(execFile);
const temporaryRoots: string[] = [];
const git = async (cwd: string, args: string[]): Promise<string> =>
  (
    await execute(
      "git",
      ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args],
      { cwd, encoding: "utf8" },
    )
  ).stdout;

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "realize-promotion-test-"));
  temporaryRoots.push(root);
  const repositoryRoot = join(root, "repository");
  const workspaceRoot = join(root, "workspaces");
  const sourcePath = join(repositoryRoot, "src/components/example.ts");
  await mkdir(join(repositoryRoot, "src/components"), { recursive: true });
  await git(root, ["init", "--template=", repositoryRoot]);
  await git(repositoryRoot, ["config", "user.email", "test@example.invalid"]);
  await git(repositoryRoot, ["config", "user.name", "Promotion Test"]);
  await writeFile(sourcePath, "export const value = 1;\n");
  await git(repositoryRoot, ["add", "."]);
  await git(repositoryRoot, ["commit", "-m", "baseline"]);
  const baseCommit = (await git(repositoryRoot, ["rev-parse", "HEAD"])).trim();
  await writeFile(sourcePath, "export const value = 2;\n");
  const diff = await git(repositoryRoot, [
    "diff",
    "--binary",
    "--no-ext-diff",
    "HEAD",
    "--",
  ]);
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
    sourceDiffHash: createHash("sha256").update(diff).digest("hex"),
    sourceEvidenceHash: "e".repeat(64),
    workspaceID: "preview-worktree-test",
  } satisfies ClaimedPreviewDeployment;
  const workspace = await preparePromotionWorktree({
    job,
    repositoryRoot,
    workspaceRoot,
  });
  await mkdir(join(workspace, ".next"), { recursive: true });
  await writeFile(join(workspace, ".next/BUILD_ID"), "test-build-id\n");
  return { root, repositoryRoot, workspaceRoot, workspace, job };
};

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of temporaryRoots.splice(0))
    await rm(root, { force: true, recursive: true });
});

describe("preview promotion worktree", () => {
  it("replays the exact diff and commits with service identity and disabled user hooks/signing", async () => {
    const input = await fixture();
    expect(await readVerifiedPromotionDiff(input)).toBe(input.job.diff);
    expect(
      await readFile(
        join(input.workspace, "src/components/example.ts"),
        "utf8",
      ),
    ).toContain("value = 2");
    const hooks = join(input.root, "hooks");
    await mkdir(hooks);
    const marker = join(input.root, "hook-ran");
    await writeFile(
      join(hooks, "pre-commit"),
      "#!/bin/sh\ntouch '" + marker + "'\nexit 1\n",
      { mode: 0o700 },
    );
    await git(input.repositoryRoot, ["config", "core.hooksPath", hooks]);
    await git(input.repositoryRoot, ["config", "commit.gpgsign", "true"]);
    vi.stubEnv("GIT_AUTHOR_NAME", "Inherited user");
    vi.stubEnv("GIT_COMMITTER_EMAIL", "inherited@example.invalid");
    const commit = await commitPromotion(input);
    expect(commit.commitSHA).toMatch(/^[a-f0-9]{40}$/);
    expect(commit.treeHash).toMatch(/^[a-f0-9]{40}$/);
    expect(commit.artifactHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await git(input.workspace, ["rev-parse", "HEAD^"])).trim()).toBe(
      input.job.baseCommit,
    );
    expect(
      (
        await git(input.workspace, [
          "log",
          "-1",
          "--format=%an <%ae>|%cn <%ce>",
        ])
      ).trim(),
    ).toBe(
      "Realize AI Preview Service <preview-service@realize.invalid>|Realize AI Preview Service <preview-service@realize.invalid>",
    );
    await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" });
    await removePromotionWorktree({
      ...input,
      branch: input.job.branch,
      workspaceID: input.job.workspaceID,
    });
    expect(
      (
        await git(input.repositoryRoot, ["branch", "--list", input.job.branch])
      ).trim(),
    ).toBe("");
  });

  it("borrows the source checkout lease for review/commit and blocks concurrent cleanup", async () => {
    const input = await fixture();
    await withGitRepositoryLock(
      { repositoryRoot: input.repositoryRoot },
      async (lease) => {
        expect(
          await readVerifiedPromotionDiff({ ...input, existingLease: lease }),
        ).toBe(input.job.diff);
        await expect(
          removePromotionWorktree({
            ...input,
            branch: input.job.branch,
            workspaceID: input.job.workspaceID,
          }),
        ).rejects.toMatchObject({ code: "repository_locked" });
        await commitPromotion({ ...input, existingLease: lease });
        lease.assertHeld();
      },
    );
    await removePromotionWorktree({
      ...input,
      branch: input.job.branch,
      workspaceID: input.job.workspaceID,
    });
  });

  it("reads accepted patch bytes without invoking a configured textconv filter", async () => {
    const input = await fixture();
    const marker = join(input.root, "textconv-ran");
    const converter = join(input.root, "textconv.sh");
    await writeFile(
      converter,
      "#!/bin/sh\ntouch '" + marker + "'\nprintf 'converted text\\n'\n",
      { mode: 0o700 },
    );
    await mkdir(join(input.repositoryRoot, ".git/info"), { recursive: true });
    await writeFile(
      join(input.repositoryRoot, ".git/info/attributes"),
      "src/components/example.ts diff=fixture\n",
    );
    await git(input.repositoryRoot, [
      "config",
      "diff.fixture.textconv",
      converter,
    ]);
    // Контрольный вызов fixture доказывает, что настроенный конвертер действительно активен.
    await git(input.workspace, ["diff", "--cached", "HEAD", "--"]);
    await expect(access(marker)).resolves.toBeUndefined();
    await rm(marker);

    expect(await readVerifiedPromotionDiff(input)).toBe(input.job.diff);
    await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["unstaged", "staged", "base"] as const)(
    "refuses a changed %s artifact after checks and before any commit",
    async (change) => {
      const input = await fixture();
      if (change === "base") {
        await git(input.workspace, [
          "commit",
          "--allow-empty",
          "-m",
          "unexpected fixture commit",
        ]);
      } else {
        await writeFile(
          join(input.workspace, "src/components/example.ts"),
          "export const value = 99;\n",
        );
        if (change === "staged") await git(input.workspace, ["add", "."]);
      }
      const before = (await git(input.workspace, ["rev-parse", "HEAD"])).trim();
      await expect(readVerifiedPromotionDiff(input)).rejects.toBeInstanceOf(
        WorktreePolicyError,
      );
      await expect(commitPromotion(input)).rejects.toBeInstanceOf(
        WorktreePolicyError,
      );
      expect((await git(input.workspace, ["rev-parse", "HEAD"])).trim()).toBe(
        before,
      );
    },
  );

  it("refuses cleanup after a worktree switches to another server branch", async () => {
    const input = await fixture();
    await git(input.workspace, ["switch", "-c", "ai/preview-other-worktree"]);
    await expect(
      removePromotionWorktree({
        ...input,
        branch: input.job.branch,
        workspaceID: input.job.workspaceID,
      }),
    ).rejects.toBeInstanceOf(WorktreePolicyError);
    await expect(access(input.workspace)).resolves.toBeUndefined();
  });

  it("cleans a missing preview worktree without pruning another missing worktree", async () => {
    const input = await fixture();
    const other = join(input.workspaceRoot, "preview-other-missing");
    await git(input.repositoryRoot, [
      "worktree",
      "add",
      "--detach",
      other,
      input.job.baseCommit,
    ]);
    await git(input.repositoryRoot, [
      "config",
      "gc.worktreePruneExpire",
      "now",
    ]);
    await rm(other, { recursive: true });
    await rm(input.workspace, { recursive: true });

    await removePromotionWorktree({
      ...input,
      branch: input.job.branch,
      workspaceID: input.job.workspaceID,
    });

    const registered = await git(input.repositoryRoot, [
      "worktree",
      "list",
      "--porcelain",
      "-z",
    ]);
    expect(registered).not.toContain("worktree " + input.workspace + "\0");
    expect(registered).toContain("worktree " + other + "\0");
  });
});
