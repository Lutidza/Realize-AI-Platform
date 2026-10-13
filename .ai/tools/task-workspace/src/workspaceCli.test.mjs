/**
 * @file .ai/tools/task-workspace/src/workspaceCli.test.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Проверяет реальные CLI маршруты, обязательные flags и локальную поставку без изменения проекта.
 * @see documentation/specifications/task-management-execution.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WorkspaceFs } from "./WorkspaceFs.adapter.mjs";
import { parseWorkspaceArguments } from "./parseWorkspaceArguments.validator.mjs";
import { runWorkspaceCommand } from "./runTaskWorkspace.controller.mjs";
const controller = fileURLToPath(
  new URL("./runTaskWorkspace.controller.mjs", import.meta.url),
);
test("CLI отклоняет неизвестные flags, повторный ввод, отсутствие revision и неявный legacy status", () => {
  for (const args of [
    ["status", "--task", "fixture", "--input", "input.json"],
    ["create", "--task", "fixture", "--title", "Title", "--root", "/tmp"],
    ["inspect", "--task", "a", "--task", "b"],
    ["adopt", "--task", "fixture", "--title", "Title"],
    ["cleanup", "--plan", "a", "--apply", "yes"],
  ])
    assert.throws(() => parseWorkspaceArguments(args));
});
test("Настоящий CLI process возвращает help и безопасную JSON ошибку неверной команды", () => {
  const good = spawnSync(
    process.execPath,
    ["--import=tsx/esm", controller, "--help"],
    { encoding: "utf8" },
  );
  assert.equal(good.status, 0);
  assert.ok(JSON.parse(good.stdout).actions.includes("archive"));
  const bad = spawnSync(
    process.execPath,
    [
      "--import=tsx/esm",
      controller,
      "status",
      "--task",
      "fixture",
      "--input",
      "hidden-secret-value",
    ],
    { encoding: "utf8" },
  );
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr).error, "expected_revision_required");
  assert.ok(!bad.stderr.includes("hidden-secret-value"));
});
test("Controller создаёт, проверяет, закрывает, архивирует и переоткрывает досье в изолированной filesystem", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "realize-workspace-cli-"));
  const storage = new WorkspaceFs(root);
  try {
    const run = (...argv) =>
      runWorkspaceCommand(storage, parseWorkspaceArguments(argv));
    let task = run(
      "create",
      "--task",
      "fixture",
      "--title",
      "CLI fixture",
      "--required-check",
      "safety",
    );
    storage.write(
      ".ai-workspace/tasks/fixture/logs/check.log",
      "verified CLI fixture\n",
    );
    storage.writeJson("register.json", {
      artifacts: [
        {
          path: "logs/check.log",
          category: "log",
          producer: { id: "fixture", pid: null, settled: true },
          retention: {
            mode: "retain",
            pinned: false,
            keepReason: null,
            referencedBy: [],
          },
        },
      ],
    });
    task = run(
      "register",
      "--task",
      "fixture",
      "--expected-revision",
      String(task.revision),
      "--input",
      "register.json",
    );
    const artifact = run("inspect", "--task", "fixture").artifacts.artifacts[0];
    storage.writeJson("result.json", {
      summary: "Verified CLI flow",
      artifacts: [
        { id: artifact.id, revision: artifact.revision, hash: artifact.hash },
      ],
      checks: [{ id: "safety", status: "passed", evidence: "logs/check.log" }],
    });
    task = run(
      "result",
      "--task",
      "fixture",
      "--expected-revision",
      String(task.revision),
      "--input",
      "result.json",
    );
    storage.writeJson("status.json", { category: "closed" });
    task = run(
      "status",
      "--task",
      "fixture",
      "--expected-revision",
      String(task.revision),
      "--input",
      "status.json",
    );
    assert.equal(task.status.category, "closed");
    assert.ok(storage.exists(".ai-workspace/tasks/fixture/TASK.md"));
    task = run(
      "archive",
      "--task",
      "fixture",
      "--expected-revision",
      String(task.revision),
    );
    assert.ok(storage.exists(".ai-workspace/history/fixture/logs/check.log"));
    assert.ok(!storage.exists(".ai-workspace/tasks/fixture/TASK.md"));
    task = run(
      "reopen",
      "--task",
      "fixture",
      "--expected-revision",
      String(task.revision),
    );
    assert.equal(task.status.category, "active");
    assert.equal(task.execution.runtimeRef, null);
    assert.equal(task.archivedAt, null);
    assert.equal(
      storage.read(".ai-workspace/tasks/fixture/logs/check.log").toString(),
      "verified CLI fixture\n",
    );
  } finally {
    storage.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
