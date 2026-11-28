/**
 * @file .ai/tools/worker-assignment/test/ideApplyReceipt.test.ts
 * @version 1.0.0
 * @date 2026-11-27
 * @description Проверяет согласие, конфликты, восстановление и перенос реальных Git blobs в рабочую копию.
 * @see documentation/specifications/internal-mcp.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { IdeAssignmentQueue } from "realize-ai-platform/ide-assignment-queue";
import { createRepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import { ideWriteAssignment } from "../src/ideWriteAssignment.contract";
import { applyIdeWriteReceipt } from "../src/applyIdeWriteReceipt.service";

test("Согласованный перенос сверяет все файлы до записи, сохраняет индекс и восстанавливается после потери квитанции", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "apply-assignment-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const repo = join(dir, "repo");
  await mkdir(join(repo, "src"), { recursive: true });
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  const write = (p: string, txt: string) => writeFile(join(repo, p), txt);
  const read = (p: string) => readFile(join(repo, p), "utf8");
  const path = "src/existing file.txt",
    added = "src/nested/new.txt",
    other = "src/other.txt";
  git("init", "--quiet");
  await write(path, "before\n");
  await write(other, "outside\n");
  git("add", ".");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@invalid.example",
    "commit",
    "-qm",
    "fixture",
  );
  const baseCommit = git("rev-parse", "HEAD").trim();
  await mkdir(join(repo, "src/nested"));
  await write(added, "new\n");
  await write(path, "after\n");
  git("add", "-N", "--", added);
  const diff = git("diff", "--binary", "--no-ext-diff", "HEAD", "--");
  git("restore", "--staged", "--", added);
  git("restore", "--", path);
  await rm(join(repo, "src/nested"), { recursive: true });
  await write(other, "staged outside\n");
  git("add", "--", other);
  await write(other, "unstaged outside\n");
  const index = git("ls-files", "--stage");
  const task = "change two files",
    role = ".ai/roles/example.md";
  const queue = new IdeAssignmentQueue(join(dir, "queue"), repo);
  t.after(() => queue.close());
  queue.submit("owner", { task, idempotencyKey: randomUUID() });
  const job = queue.claim()!;
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  const operations = [
    { action: "modify", path, reason: "update" },
    { action: "create", path: added, reason: "create" },
  ];
  const proposal = {
    role,
    sources: [role],
    baseCommit,
    taskSha256: hash(task),
    operations,
  };
  queue.awaitWriteApproval(job.runId, job.token, proposal);
  const proposalHash = JSON.parse(
    String(queue.get("owner", job.runId).report),
  ).proposalSha256;
  queue.approveWrite("owner", job.runId, proposalHash);
  const writeJob = queue.claim()!;
  const assignment = ideWriteAssignment.parse({
    id: job.runId,
    executor: "ai-execution-worker",
    assignedBy: "orchestrator",
    returnsTo: "orchestrator",
    revision: 1,
    mode: "scoped-write",
    role,
    requiredSources: [role],
    baseCommit,
    taskSha256: hash(task),
    mission: task,
    permissions: {
      writePaths: [path, added],
      operations,
      output: "verified-diff",
    },
    checks: ["scope", "git diff --check", "sha256"],
  });
  const receipt = {
    runId: job.runId,
    executor: assignment.executor,
    baseCommit,
    allowedPaths: [path, added],
    changedPaths: [path, added],
    checks: assignment.checks,
    diff,
    diffSha256: hash(diff),
  };
  queue.finish(job.runId, writeJob.token, "completed", JSON.stringify(receipt));
  assert.equal(queue.claim(), null);
  assert.throws(() => queue.approveApply("other", job.runId, hash(diff)));
  assert.throws(() => queue.approveApply("owner", job.runId, hash("other")));
  assert.equal(
    queue.approveApply("owner", job.runId, hash(diff)).status,
    "queued",
  );
  const claimed = queue.claim()!;
  assert.equal(claimed.runId, job.runId);
  const apply = claimed.apply!;
  const policy = await createRepositoryReadPolicy(repo, true);
  let starts = 0;
  const run = (started = false) =>
    applyIdeWriteReceipt(
      policy,
      join(dir, "worktrees"),
      assignment,
      { ...apply, started },
      () => {
        starts++;
        queue.beginApply(job.runId, claimed.token, hash(diff));
      },
      new AbortController().signal,
    );
  await write(path, "editor change\n");
  await assert.rejects(run(), /worktree_conflict/);
  await assert.rejects(read(added), { code: "ENOENT" });
  await write(path, "staged\n");
  git("add", "--", path);
  await write(path, "before\n");
  await assert.rejects(run(), /index_conflict/);
  git("restore", "--staged", "--", path);
  assert.equal(starts, 0);
  const applied = await run();
  assert.equal(JSON.parse(applied.report).phase, "applied");
  assert.equal(await read(path), "after\n");
  assert.equal(await read(added), "new\n");
  assert.equal(await read(other), "unstaged outside\n");
  assert.equal(git("ls-files", "--stage"), index);
  assert.equal(git("rev-parse", "HEAD").trim(), baseCommit);
  assert.equal((await run(true)).report, applied.report);
  assert.equal(starts, 1);
  // Имитируем остановку между файловыми операциями при уже записанном намерении.
  await rm(join(repo, added));
  assert.equal((await run(true)).report, applied.report);
  assert.equal(await read(added), "new\n");
  queue.finish(job.runId, claimed.token, "completed", applied.report);
  assert.equal(
    queue.approveApply("owner", job.runId, hash(diff)).status,
    "completed",
  );
  assert.equal(queue.claim(), null);
});
