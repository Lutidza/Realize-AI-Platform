/**
 * @file .ai/tools/task-workspace/test/workspaceCli.test.mjs
 * @version 1.0.4
 * @date 2026-10-15
 * @description Проверяет реальные CLI маршруты, обязательные flags и локальную поставку без изменения проекта.
 * @see documentation/specifications/task-management-execution.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { WorkspaceFs } from "../src/filesystem/WorkspaceFs.adapter.mjs";
import { parseWorkspaceArguments } from "../src/cli/parseWorkspaceArguments.validator.mjs";
import { runWorkspaceCommand } from "../src/cli/runWorkspaceCommand.controller.mjs";
import { runtimeRoot } from "../src/workspacePaths.config.mjs";
import { presentCompactWorkspaceResponse } from "../src/cli/presentCompactWorkspaceResponse.util.mjs";
import {
  beginWorkspaceProducerGroup,
  finalizeWorkspaceProducerGroup,
} from "../src/producer-group/workspaceProducerGroup.index.mjs";
import { readWorkspaceOperationState } from "../src/recovery/WorkspaceOperation.repository.mjs";

/** @param {import('node:test').TestContext} context */
async function cliFixture(context) {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "realize-workspace-cli-process-"),
  );
  context.after(() => {
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  const root = path.join(temporary, "project");
  const foreignCwd = path.join(temporary, "foreign");
  const copiedSource = path.join(root, ".ai/tools/task-workspace/src");
  fs.mkdirSync(path.dirname(copiedSource), { recursive: true });
  fs.mkdirSync(foreignCwd);
  // Копируются только исходники: существующие досье и runtime не входят в fixture.
  fs.cpSync(fileURLToPath(new URL("../src/", import.meta.url)), copiedSource, {
    recursive: true,
  });
  const copiedPaths = await import(
    pathToFileURL(path.join(copiedSource, "workspacePaths.config.mjs")).href
  );
  // Ошибка вычисления корня останавливает fixture до первой изменяющей команды.
  assert.equal(path.resolve(copiedPaths.workspaceRoot), fs.realpathSync(root));
  assert.equal(path.isAbsolute(copiedPaths.runtimeRoot), false);
  assert.ok(
    path.resolve(root, copiedPaths.runtimeRoot).startsWith(root + path.sep),
  );
  // Установленные зависимости используются для чтения; все записи выполняет копия CLI.
  fs.symlinkSync(
    fileURLToPath(new URL("../../../../node_modules/", import.meta.url)),
    path.join(root, "node_modules"),
    "dir",
  );
  const controller = path.join(
    copiedSource,
    "cli/runWorkspaceCommand.controller.mjs",
  );
  /** @param {string[]} argv @param {string | Buffer} [input] */
  const invoke = (argv, input) =>
    spawnSync(
      process.execPath,
      ["--import", import.meta.resolve("tsx/esm"), controller, ...argv],
      {
        cwd: foreignCwd,
        encoding: "utf8",
        timeout: 20000,
        maxBuffer: 16 * 1024 * 1024,
        input,
      },
    );
  /** @param {string[]} argv */
  const run = (...argv) => invoke(argv);
  /** @param {string | Buffer} input @param {string[]} argv */
  const runInput = (input, ...argv) => invoke(argv, input);
  return { root, foreignCwd, run, runInput };
}

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
test("Настоящий CLI process возвращает help и безопасную JSON ошибку неверной команды", async (context) => {
  const fixture = await cliFixture(context);
  const good = fixture.run("--help");
  assert.equal(good.status, 0);
  assert.deepEqual(JSON.parse(good.stdout).actions, [
    "create",
    "adopt",
    "inspect",
    "status",
    "result",
    "register",
    "settle",
    "plan-cleanup",
    "cleanup",
    "archive",
    "reopen",
    "recover",
  ]);
  const bad = fixture.run(
    "status",
    "--task",
    "fixture",
    "--input",
    "hidden-secret-value",
  );
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr).error, "expected_revision_required");
  assert.ok(!bad.stderr.includes("hidden-secret-value"));
});
test("CLI из постороннего cwd создаёт и изменяет досье только в изолированной копии проекта", async (context) => {
  const fixture = await cliFixture(context);
  const created = fixture.run(
    "create",
    "--task",
    "foreign-cwd-fixture",
    "--title",
    "Изолированная проверка CLI",
  );
  assert.equal(created.status, 0, created.stderr);
  const task = JSON.parse(created.stdout);
  assert.equal(task.localKey, "foreign-cwd-fixture");
  assert.ok(
    fs.existsSync(
      path.join(
        fixture.root,
        ".ai-workspace/tasks/foreign-cwd-fixture/TASK.md",
      ),
    ),
  );
  fs.writeFileSync(
    path.join(fixture.root, "status.json"),
    JSON.stringify({ category: "active" }),
  );
  const changed = fixture.run(
    "status",
    "--task",
    "foreign-cwd-fixture",
    "--expected-revision",
    String(task.revision),
    "--input",
    "status.json",
  );
  assert.equal(changed.status, 0, changed.stderr);
  const inspected = fixture.run("inspect", "--task", "foreign-cwd-fixture");
  assert.equal(inspected.status, 0, inspected.stderr);
  const current = JSON.parse(inspected.stdout);
  assert.equal(current.task.status.category, "active");
  assert.equal(current.task.revision, task.revision + 1);
  assert.ok(
    fs.existsSync(
      path.join(fixture.root, runtimeRoot, "locks/foreign-cwd-fixture.lock"),
    ),
  );
  assert.equal(
    fs.existsSync(path.join(fixture.foreignCwd, ".ai-workspace")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(fixture.foreignCwd, runtimeRoot)),
    false,
  );
});
test("Controller создаёт, проверяет, закрывает, архивирует и переоткрывает досье в изолированной filesystem", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "realize-workspace-cli-"));
  const storage = new WorkspaceFs(root);
  try {
    /** @param {string[]} argv */
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

test("V06: настоящий CLI отклоняет result внутри зарегистрированного дерева без изменения досье", async (context) => {
  const value = await cliFixture(context);
  const created = value.run(
    "create",
    "--task",
    "protected-output",
    "--title",
    "Защита результата",
  );
  assert.equal(created.status, 0, created.stderr);
  const base = path.join(value.root, ".ai-workspace/tasks/protected-output");
  const tree = path.join(base, "logs/results");
  fs.mkdirSync(tree, { recursive: true });
  fs.writeFileSync(
    path.join(tree, "evidence.txt"),
    "Исходное доказательство\n",
  );
  fs.writeFileSync(
    path.join(value.root, "register.json"),
    JSON.stringify({
      artifacts: [
        {
          path: "logs/results",
          category: "log",
          producer: { id: "cli-fixture", pid: null, settled: true },
          retention: {
            mode: "retain",
            pinned: false,
            keepReason: null,
            referencedBy: [],
          },
        },
      ],
    }),
  );
  const registered = value.run(
    "register",
    "--task",
    "protected-output",
    "--expected-revision",
    "1",
    "--input",
    "register.json",
  );
  assert.equal(registered.status, 0, registered.stderr);
  fs.writeFileSync(
    path.join(value.root, "result.json"),
    JSON.stringify({ summary: "Новая сдача", artifacts: [], checks: [] }),
  );
  const before = [
    "TASK.md",
    "artifact-manifest.json",
    "logs/results/evidence.txt",
  ].map((file) => fs.readFileSync(path.join(base, file)));
  const result = value.run(
    "result",
    "--task",
    "protected-output",
    "--expected-revision",
    String(JSON.parse(registered.stdout).revision),
    "--input",
    "result.json",
  );
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).error, "result_output_registered");
  assert.deepEqual(fs.readdirSync(tree), ["evidence.txt"]);
  assert.deepEqual(
    ["TASK.md", "artifact-manifest.json", "logs/results/evidence.txt"].map(
      (file) => fs.readFileSync(path.join(base, file)),
    ),
    before,
  );
});

test("CLI recover после частичной инициализации использует исходный ID и не принимает новую revision", async (context) => {
  const fixture = await cliFixture(context);
  const storage = new WorkspaceFs(fixture.root);
  context.after(() => storage.close());
  const write = storage.write.bind(storage);
  storage.write = (file, bytes, exclusive) => {
    if (file.endsWith("/TASK.md")) throw new Error("interrupted init");
    return write(file, bytes, exclusive);
  };
  let operationId = "";
  assert.throws(
    () =>
      runWorkspaceCommand(storage, {
        action: "create",
        flags: { task: "recover-init", title: "Частичная инициализация" },
      }),
    (error) => {
      assert.ok(error instanceof Error && "operation" in error);
      const reference =
        /** @type {import('../src/recovery/WorkspaceOperation.types.ts').WorkspaceOperationReference} */ (
          error.operation
        );
      operationId = reference.operationId;
      return error.message === "interrupted init";
    },
  );
  storage.write = write;
  const inspected = fixture.run("inspect", "--task", "recover-init");
  assert.equal(inspected.status, 0, inspected.stderr);
  const inspection = JSON.parse(inspected.stdout);
  assert.equal(inspection.task, null);
  assert.equal(inspection.recovery.operations[0].operationId, operationId);
  assert.equal(JSON.stringify(inspection).includes('"writes"'), false);
  const compactPending = fixture.run(
    "inspect",
    "--task",
    "recover-init",
    "--compact",
  );
  assert.equal(compactPending.status, 0, compactPending.stderr);
  const pendingSummary = JSON.parse(compactPending.stdout);
  assert.equal(pendingSummary.status, "completed");
  assert.equal(pendingSummary.revision, null);
  assert.equal(pendingSummary.error, inspection.diagnostic);
  assert.deepEqual(
    pendingSummary.recovery.operations,
    inspection.recovery.operations,
  );
  const pendingFailure = fixture.runInput(
    "{}",
    "status",
    "--task",
    "recover-init",
    "--expected-revision",
    "1",
    "--input",
    "-",
    "--compact",
  );
  assert.equal(pendingFailure.status, 1, pendingFailure.stderr);
  const diagnostic = JSON.parse(pendingFailure.stderr);
  assert.equal(diagnostic.status, "error");
  assert.equal(diagnostic.error, "operation_recovery_required");
  assert.equal(diagnostic.revision, null);
  assert.equal(diagnostic.operation.operationId, operationId);
  assert.ok(diagnostic.message);
  const rejected = fixture.run(
    "recover",
    "--task",
    "recover-init",
    "--operation",
    operationId,
    "--expected-revision",
    "2",
  );
  assert.equal(JSON.parse(rejected.stderr).error, "unknown_flag");
  const recovered = fixture.run(
    "recover",
    "--task",
    "recover-init",
    "--operation",
    operationId,
  );
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(JSON.parse(recovered.stdout).revision, 1);
  const replayed = fixture.run(
    "recover",
    "--task",
    "recover-init",
    "--operation",
    operationId,
  );
  assert.equal(replayed.status, 0, replayed.stderr);
  assert.deepEqual(JSON.parse(replayed.stdout), JSON.parse(recovered.stdout));
  const compactReplay = fixture.run(
    "recover",
    "--task",
    "recover-init",
    "--operation",
    operationId,
    "--compact",
  );
  assert.equal(compactReplay.status, 0, compactReplay.stderr);
  const compactRecovered = JSON.parse(compactReplay.stdout);
  assert.equal(compactRecovered.revision, 1);
  assert.equal(compactRecovered.recovery.requestedOperationId, operationId);
});

/** Снимок только временного dossier/runtime; source copy и node_modules не участвуют.
 * @param {string} root
 */
function cliWorkspaceBytes(root) {
  /** @type {Record<string, string>} */
  const files = {};
  /** @param {string} relative */
  const visit = (relative) => {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) return;
    for (const name of fs.readdirSync(absolute).sort()) {
      const file = path.join(relative, name);
      if (fs.lstatSync(path.join(root, file)).isDirectory()) visit(file);
      else
        files[file] = fs.readFileSync(path.join(root, file)).toString("base64");
    }
  };
  visit(".ai-workspace");
  visit(runtimeRoot);
  return files;
}

test("P06 CLI stdin принимает ровно 1 MiB, не создаёт input file и сохраняет default полный ответ", async (context) => {
  const fixture = await cliFixture(context);
  const created = fixture.run(
    "create",
    "--task",
    "stdin-limit",
    "--title",
    "Предел stdin",
  );
  assert.equal(created.status, 0, created.stderr);
  const input = '{"category":"active"}';
  const changed = fixture.runInput(
    input + " ".repeat(1024 * 1024 - Buffer.byteLength(input)),
    "status",
    "--task",
    "stdin-limit",
    "--expected-revision",
    "1",
    "--input",
    "-",
  );
  assert.equal(changed.status, 0, changed.stderr);
  const task = JSON.parse(changed.stdout);
  assert.equal(task.revision, 2);
  assert.equal(task.status.category, "active");
  assert.equal(task.execution.state, null);
  assert.ok(changed.stdout.startsWith('{\n  "schemaVersion"'));
  assert.deepEqual(fs.readdirSync(fixture.root).sort(), [
    ".ai",
    ".ai-workspace",
    "node_modules",
  ]);
  const help = fixture.run("--help", "--compact");
  assert.equal(help.status, 0, help.stderr);
  assert.ok(JSON.parse(help.stdout).actions.includes("inspect"));
});

test("P06 CLI stdin oversize, invalid JSON, второй JSON и неоднозначные flags не изменяют workspace", async (context) => {
  const fixture = await cliFixture(context);
  assert.equal(
    fixture.run("create", "--task", "bad-stdin", "--title", "Отказы stdin")
      .status,
    0,
  );
  const before = cliWorkspaceBytes(fixture.root);
  const args = [
    "status",
    "--task",
    "bad-stdin",
    "--expected-revision",
    "1",
    "--input",
    "-",
  ];
  for (const [input, code] of [
    [" ".repeat(1024 * 1024 + 1), "file_limit"],
    ['{"category":', "invalid_json"],
    ["{} {}", "invalid_json"],
    ["", "invalid_json"],
    [Buffer.from([0xff]), "invalid_json"],
    ['{"unknown":true}', "invalid_contract"],
  ]) {
    const failed = fixture.runInput(input, ...args, "--compact");
    assert.equal(failed.status, 1, failed.stderr);
    const error = JSON.parse(failed.stderr);
    assert.equal(error.error, code);
    assert.equal(error.status, "error");
    assert.equal(error.revision, null);
    assert.equal(failed.stdout, "");
    assert.deepEqual(cliWorkspaceBytes(fixture.root), before);
  }
  for (const tail of [
    ["--input", "other.json"],
    ["--compact", "--compact"],
    ["--compact", "true"],
    ["--compact=true"],
    ["--output", "logs/unused.json"],
  ]) {
    const failed = fixture.runInput("{}", ...args, ...tail);
    assert.equal(failed.status, 1, failed.stderr);
    assert.deepEqual(cliWorkspaceBytes(fixture.root), before);
  }
});

test("P06 CLI stdin и file сохраняют одинаковый UTF-8 replacement внутри JSON строки", async (context) => {
  const fixture = await cliFixture(context);
  const bytes = Buffer.concat([
    Buffer.from('{"summary":"'),
    Buffer.from([0xff]),
    Buffer.from('","checks":[],"artifacts":[]}'),
  ]);
  fs.writeFileSync(path.join(fixture.root, "utf8.json"), bytes);
  for (const input of ["-", "utf8.json"]) {
    const key = input === "-" ? "utf8-stdin" : "utf8-file";
    assert.equal(
      fixture.run("create", "--task", key, "--title", "UTF-8 compatibility")
        .status,
      0,
    );
    const result = fixture.runInput(
      bytes,
      "result",
      "--task",
      key,
      "--expected-revision",
      "1",
      "--input",
      input,
      "--compact",
    );
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.status, "completed");
    assert.equal(summary.revision, 2);
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(
          fixture.root,
          ".ai-workspace/tasks",
          key,
          summary.result.path,
        ),
        "utf8",
      ),
    );
    assert.equal(manifest.summary, "\uFFFD");
  }
});

test("P06 CLI защищённый file input и --output сохраняют назначение рядом с --compact", async (context) => {
  const fixture = await cliFixture(context);
  const created = fixture.run(
    "create",
    "--task",
    "compact-plan",
    "--title",
    "План компактного CLI",
    "--compact",
  );
  assert.equal(created.status, 0, created.stderr);
  const createdSummary = JSON.parse(created.stdout);
  assert.equal(createdSummary.status, "completed");
  assert.equal(createdSummary.action, "create");
  assert.equal(createdSummary.outcome, null);
  assert.equal(createdSummary.key, "compact-plan");
  assert.equal(createdSummary.revision, 1);
  fs.writeFileSync(path.join(fixture.root, ".env"), "{}");
  const before = cliWorkspaceBytes(fixture.root);
  const protectedInput = fixture.run(
    "status",
    "--task",
    "compact-plan",
    "--expected-revision",
    "1",
    "--input",
    ".env",
    "--compact",
  );
  assert.equal(protectedInput.status, 1);
  assert.equal(JSON.parse(protectedInput.stderr).error, "protected_input");
  assert.deepEqual(cliWorkspaceBytes(fixture.root), before);
  const temporary = path.join(
    fixture.root,
    ".ai-workspace/tasks/compact-plan/tmp/selected",
  );
  fs.mkdirSync(temporary, { recursive: true });
  fs.writeFileSync(path.join(temporary, "scratch"), "temporary\n");
  const registered = fixture.runInput(
    JSON.stringify({
      artifacts: [
        {
          path: "tmp/selected",
          category: "temporary",
          producer: { id: "test", pid: null, settled: true },
          retention: {
            mode: "temporary",
            pinned: false,
            keepReason: null,
            referencedBy: [],
          },
        },
      ],
    }),
    "register",
    "--task",
    "compact-plan",
    "--expected-revision",
    "1",
    "--input",
    "-",
  );
  assert.equal(registered.status, 0, registered.stderr);
  const planned = fixture.runInput(
    "{}",
    "plan-cleanup",
    "--task",
    "compact-plan",
    "--expected-revision",
    "2",
    "--input",
    "-",
    "--output",
    "logs/selected-plan.json",
    "--compact",
  );
  assert.equal(planned.status, 0, planned.stderr);
  const summary = JSON.parse(planned.stdout);
  assert.equal(summary.revision, 2);
  assert.equal(summary.plan.taskRevision, 2);
  assert.equal(
    summary.plan.file,
    ".ai-workspace/tasks/compact-plan/logs/selected-plan.json",
  );
  const plan = JSON.parse(
    fs.readFileSync(path.join(fixture.root, summary.plan.file), "utf8"),
  );
  assert.equal(summary.plan.requestId, plan.requestId);
  assert.equal(summary.plan.hash, plan.hash);
  assert.deepEqual(summary.plan.paths, ["tmp/selected"]);
  const preview = fixture.run(
    "cleanup",
    "--plan",
    summary.plan.file,
    "--compact",
  );
  assert.equal(preview.status, 0, preview.stderr);
  const previewSummary = JSON.parse(preview.stdout);
  assert.equal(previewSummary.key, "compact-plan");
  assert.equal(previewSummary.outcome, "preview");
  assert.equal(previewSummary.revision, null);
  assert.deepEqual(previewSummary.plan, summary.plan);
  const applied = fixture.run(
    "cleanup",
    "--plan",
    summary.plan.file,
    "--apply",
    "--compact",
  );
  assert.equal(applied.status, 0, applied.stderr);
  const appliedSummary = JSON.parse(applied.stdout);
  assert.equal(appliedSummary.revision, null);
  assert.equal(appliedSummary.key, "compact-plan");
  assert.equal(appliedSummary.outcome, "completed");
  assert.deepEqual(appliedSummary.plan, summary.plan);
  assert.equal(fs.existsSync(temporary), false);
});

test("P06 compact inspect сохраняет artifact refs из уже загруженного manifest", async (context) => {
  const fixture = await cliFixture(context);
  assert.equal(
    fixture.run("create", "--task", "compact-refs", "--title", "Refs").status,
    0,
  );
  const directory = path.join(
    fixture.root,
    ".ai-workspace/tasks/compact-refs/logs",
  );
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "proof.log"), "proof\n");
  const input = {
    artifacts: [
      {
        path: "logs/proof.log",
        category: "log",
        producer: { id: "test", pid: null, settled: true },
        retention: {
          mode: "retain",
          pinned: false,
          keepReason: null,
          referencedBy: [],
        },
      },
    ],
  };
  const registered = fixture.runInput(
    JSON.stringify(input),
    "register",
    "--task",
    "compact-refs",
    "--expected-revision",
    "1",
    "--input",
    "-",
    "--compact",
  );
  assert.equal(registered.status, 0, registered.stderr);
  assert.equal(JSON.parse(registered.stdout).artifacts, null);
  const full = fixture.run("inspect", "--task", "compact-refs");
  const compact = fixture.run("inspect", "--task", "compact-refs", "--compact");
  assert.equal(compact.status, 0, compact.stderr);
  const fullValue = JSON.parse(full.stdout);
  const summary = JSON.parse(compact.stdout);
  assert.equal(summary.revision, fullValue.task.revision);
  assert.deepEqual(
    summary.artifacts,
    fullValue.artifacts.artifacts.map(
      /** @param {import('@realize/payload-task-manager/workspace-contracts').WorkspaceArtifact} artifact */
      ({ id, revision, hash, path, state }) => ({
        id,
        revision,
        hash,
        path,
        state,
      }),
    ),
  );
  assert.ok(Buffer.byteLength(compact.stdout) < Buffer.byteLength(full.stdout));
  assert.equal(compact.stdout.trim().split("\n").length, 1);
  assert.equal("producer" in summary.artifacts[0], false);
});

test("P06 compact recover сохраняет producer-begin и nested cleanup refs без восстановления handle", async (context) => {
  const fixture = await cliFixture(context);
  assert.equal(
    fixture.run(
      "create",
      "--task",
      "recover-producer",
      "--title",
      "Producer recovery refs",
    ).status,
    0,
  );
  const storage = new WorkspaceFs(fixture.root);
  context.after(() => storage.close());
  /** @type {Record<string,string>} */
  const ids = {};
  const write = storage.write.bind(storage);
  storage.write = (file, bytes, exclusive) => {
    if (file.endsWith("/pending.json")) {
      const journal = JSON.parse(bytes.toString());
      ids[journal.kind] = journal.operationId;
    }
    return write(file, bytes, exclusive);
  };
  const group = beginWorkspaceProducerGroup(storage, "recover-producer", {
    artifacts: [{ path: "tmp/producer", category: "temporary" }],
  });
  const began = fixture.run(
    "recover",
    "--task",
    "recover-producer",
    "--operation",
    ids["producer-begin"],
    "--compact",
  );
  assert.equal(began.status, 0, began.stderr);
  const beginSummary = JSON.parse(began.stdout);
  assert.deepEqual(beginSummary.producer.artifactIds, group.artifactIds);
  assert.deepEqual(beginSummary.producer.paths, group.paths);
  assert.equal(beginSummary.revision, null);
  const finalized = finalizeWorkspaceProducerGroup(storage, group, {
    quiescent: true,
    cleanupTemporary: true,
  });
  assert.equal(finalized.status, "completed");
  const recovered = fixture.run(
    "recover",
    "--task",
    "recover-producer",
    "--operation",
    ids["producer-finalize"],
    "--compact",
  );
  assert.equal(recovered.status, 0, recovered.stderr);
  const summary = JSON.parse(recovered.stdout);
  assert.equal(summary.revision, null);
  assert.equal(summary.outcome, "completed");
  assert.equal(summary.producer.settlement, "settled");
  assert.deepEqual(summary.cleanup, { ...finalized.cleanup, reason: null });
  assert.equal(summary.plan.file, finalized.cleanup.planPath);
  assert.equal(summary.plan.requestId, summary.cleanup.receipt.requestId);
  assert.equal(summary.recovery.requestedOperationId, ids["producer-finalize"]);
  assert.equal(
    readWorkspaceOperationState(storage, "recover-producer").pending,
    null,
  );
});

test("P06 compact presenter сохраняет reason/operation и null вместо догадки о revision", () => {
  const operation = {
    operationId: "fixture-id",
    key: "fixture",
    kind: "producer-finalize",
    phase: "prepared",
    path: "runtime/pending.json",
    ownerPhase: "cleanup",
    planPath: "logs/plan.json",
  };
  const summary = presentCompactWorkspaceResponse(
    { action: "recover", flags: { task: "fixture", operation: "fixture-id" } },
    {
      status: "blocked",
      reason: "artifact_changed",
      operation,
      artifactIds: ["artifact"],
      phase: "cleanup",
      settlement: "settled",
      cleanup: {
        status: "blocked",
        paths: ["tmp/a"],
        reason: "artifact_changed",
        planPath: "logs/plan.json",
      },
    },
  );
  assert.equal(summary.reason, "artifact_changed");
  assert.equal(summary.revision, null);
  assert.deepEqual(summary.operation, operation);
  assert.equal(summary.cleanup?.planPath, "logs/plan.json");
  assert.equal(summary.producer?.settlement, "settled");
});
