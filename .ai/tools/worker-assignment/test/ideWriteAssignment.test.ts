/**
 * @file .ai/tools/worker-assignment/test/ideWriteAssignment.test.ts
 * @version 1.1.0
 * @date 2026-11-27
 * @description Проверяет область локального Code Lane в настоящем временном Git worktree.
 * @see documentation/specifications/internal-mcp.md
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { pathMatchesExecutionScope } from "@realize/change-engine";
import { resolveTemplateWriteScope } from "../../../../services/ai-execution-worker/src/resolveTemplateWriteScope.service";
import { assertWorktreePathSafety } from "../../../../services/ai-execution-worker/src/assertWorktreePathSafety.validator";
import { executeIdeWriteAssignment } from "../../../../services/ai-execution-worker/src/executeIdeWriteAssignment.service";
import {
  ideWriteGrant,
  ideWriteAssignment,
  verifyIdeWriteReceipt,
} from "../src/ideWriteAssignment.contract";

const runGit = (repo: string, ...args: string[]) =>
  execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
test("Code Lane проверяет весь набор правок до записи и выдаёт воспроизводимый diff", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "ide-write-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const repo = join(temp, "repo");
  const role = ".ai/roles/example.md";
  await mkdir(join(repo, ".ai/roles"), { recursive: true });
  await mkdir(join(repo, "src"));
  await writeFile(join(repo, role), "Developer\n");
  await writeFile(join(repo, "src/example.txt"), "before\n");
  const readOnlyPath = "src/other.txt";
  await writeFile(join(repo, readOnlyPath), "reference\n");
  await symlink(temp, join(repo, "src/link"));
  const git = (...args: string[]) => runGit(repo, ...args);
  git("init", "--quiet");
  git("add", ".");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@invalid.example",
    "commit",
    "--quiet",
    "-m",
    "base",
  );
  const path = "src/example.txt",
    mission = "Update the specified text.";
  const grant = {
    mode: "scoped-write",
    baseCommit: git("rev-parse", "HEAD"),
    role,
    taskSha256: hash(mission),
    requiredSources: [role, readOnlyPath],
    permissions: { writePaths: [path], output: "verified-diff" },
    checks: ["scope", "git diff --check", "sha256"],
  };
  const run = (edits: { path: string; content: string }[], paths = [path]) =>
    executeIdeWriteAssignment(
      repo,
      join(temp, "worktrees"),
      {
        ...grant,
        permissions: { ...grant.permissions, writePaths: paths },
        id: randomUUID(),
        assignedBy: "orchestrator",
        returnsTo: "orchestrator",
        executor: "ai-execution-worker",
        revision: 1,
        mission,
      },
      new AbortController().signal,
      async () => ({ status: "completed", summary: "", edits }),
    );
  const edit = { path, content: "after\n" };
  const receipt = await run([edit]);
  assert.deepEqual(receipt.changedPaths, [path]);
  assert.equal(receipt.diffSha256, hash(receipt.diff));
  assert.match(receipt.diff, /^-before\n\+after$/m);
  const assignment = ideWriteAssignment.parse({
    ...grant,
    mission,
    id: receipt.runId,
    revision: 1,
    assignedBy: "orchestrator",
    returnsTo: "orchestrator",
    executor: receipt.executor,
  });
  assert.deepEqual(verifyIdeWriteReceipt(assignment, receipt), receipt);
  assert.throws(() =>
    verifyIdeWriteReceipt(assignment, { ...receipt, diff: receipt.diff + "x" }),
  );
  assert.throws(() =>
    verifyIdeWriteReceipt(assignment, {
      ...receipt,
      changedPaths: [readOnlyPath],
    }),
  );
  await assert.rejects(
    run([edit, { path: readOnlyPath, content: "x" }]),
    /scope_violation/,
  );
  await assert.rejects(run([], ["src/link/escape.txt"]), /unsafe_path/);
  assert.equal(
    ideWriteGrant.safeParse({
      ...grant,
      permissions: {
        ...grant.permissions,
        writePaths: [".ai/roles/example.md"],
      },
    }).success,
    false,
  );
  assert.equal(await readFile(join(repo, path), "utf8"), "before\n");
  assert.equal(git("status", "--porcelain"), "");
  assert.equal(
    git("worktree", "list", "--porcelain").split("worktree ").length,
    2,
  );
});

test("Права на файлы шаблона определяются SDK-метаданными базового коммита и точным списком задачи", async (t) => {
  const repo = await mkdtemp(join(tmpdir(), "template-scope-"));
  t.after(() => rm(repo, { recursive: true, force: true }));
  const git = (...args: string[]) => runGit(repo, ...args);
  const write = async (path: string, content: unknown) => {
    await mkdir(dirname(join(repo, path)), { recursive: true });
    await writeFile(join(repo, path), JSON.stringify(content));
  };
  await write("package.json", {
    workspaces: ["packages/*", "!packages/excluded"],
  });
  const bounds = { minimum: "1.0.0", maximumExclusive: "2.0.0" };
  const manifest = {
    schemaVersion: "1.0",
    id: "example",
    version: "2.1.3",
    displayName: "Example",
    entries: { frontend: "./view" },
    targets: [{ target: "frontend", screens: ["page"] }],
    compatibility: {
      contractVersion: "1.0",
      platform: bounds,
      react: bounds,
      next: bounds,
    },
    settings: {
      schemaVersion: "1.0.0",
      schemaPath: "settings.json",
      defaults: {},
    },
    palettes: [
      { id: "base", version: "1.0.0", label: "Base", modes: ["light"] },
    ],
    ui: { contractVersion: "1.0", primitives: [], inheritsDefault: true },
  };
  const first = "packages/cobalt",
    second = "packages/paper";
  for (const [name, exported] of [
    ["cobalt", "meta/view.json"],
    ["paper", "descriptor.json"],
    ["excluded", "descriptor.json"],
  ]) {
    await write("packages/" + name + "/package.json", {
      name: "@third-party/" + name,
      version: "0.8.0",
      exports: { "./manifest.json": "./" + exported },
    });
    await write("packages/" + name + "/" + exported, {
      ...manifest,
      packageName: "@third-party/" + name,
    });
  }
  const library = "packages/template-library";
  await write(library + "/package.json", { name: "@third-party/library" });
  await write(first + "/embedded/package.json", { name: "embedded" });
  await symlink(repo, join(repo, first, "link"));
  git("init", "--quiet");
  git("add", ".");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@invalid.example",
    "commit",
    "--quiet",
    "-m",
    "workspace",
  );
  const base = git("rev-parse", "HEAD");
  const path = first + "/ui/header.css",
    other = second + "/layout.ts";
  const scope = (files: string[]) =>
    resolveTemplateWriteScope(repo, base, files);
  const permitted = await scope([path, other]);
  assert.deepEqual([...permitted], [path, other]);
  assert.equal(pathMatchesExecutionScope(path, [path]), false);
  await assertWorktreePathSafety(repo, path, [path], permitted);
  await assert.rejects(
    assertWorktreePathSafety(
      repo,
      first + "/ui/neighbor.css",
      [path],
      permitted,
    ),
  );
  await assert.rejects(scope([first + "/embedded/file.ts"]), /nested_owner/);
  await assert.rejects(scope([first + "/link/file.ts"]), /unsafe_path/);
  await assert.rejects(scope([first + "/meta"]), /unsafe_path/);
  await assert.rejects(scope([first + "/package.json"]), /scope_forbidden/);
  await assert.rejects(
    scope(["packages/excluded/file.ts"]),
    /package_unverified/,
  );
  // Рабочая копия выдаёт библиотеку за шаблон. Разрешение проверяется по старому неизменяемому коммиту.
  await write(library + "/package.json", {
    name: "@third-party/library",
    exports: { "./manifest.json": "./manifest.json" },
  });
  await write(library + "/manifest.json", {
    ...manifest,
    packageName: "@third-party/library",
  });
  await assert.rejects(scope([library + "/file.ts"]), /package_unverified/);
});
