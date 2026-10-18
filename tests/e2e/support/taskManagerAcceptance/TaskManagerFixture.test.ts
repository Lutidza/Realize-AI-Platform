/**
 * @file tests/e2e/support/taskManagerAcceptance/TaskManagerFixture.test.ts
 * @version 1.0.3
 * @date 2026-10-15
 * @description Проверяет настоящий producer lifecycle fixture при success, failure и interruption без рабочей БД.
 * @see documentation/specifications/task-management-execution.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { workspaceOperationPaths } from "../../../../.ai/tools/task-workspace/src/recovery/WorkspaceOperation.repository.mjs";
import type { WorkspaceArtifact } from "@realize/payload-task-manager/workspace-contracts";
import { writeAppTypeDeclarations } from "next/dist/lib/typescript/writeAppTypeDeclarations";
import { WorkspaceFs } from "../../../../.ai/tools/task-workspace/src/filesystem/WorkspaceFs.adapter.mjs";
import { createDossier } from "../../../../.ai/tools/task-workspace/src/dossier/createDossier.service.mjs";
import {
  readDossier,
  readArtifacts,
} from "../../../../.ai/tools/task-workspace/src/dossier/Dossier.repository.mjs";
import {
  beginWorkspaceProducerGroup,
  finalizeWorkspaceProducerGroup,
} from "../../../../.ai/tools/task-workspace/src/producer-group/workspaceProducerGroup.index.mjs";
import { isDefiniteFixtureCreateRejection } from "./FixtureDatabaseCreateOutcome.validator";
import { createFixtureDatabase } from "./createFixtureDatabase.adapter";
import { createTaskManagerFixtureOptions } from "./createTaskManagerFixtureOptions.config";
import { runTaskManagerFixture } from "./runTaskManagerFixture.service";
import { createFixtureReceiptCoordinator } from "./createFixtureReceiptCoordinator.service";
import { createFixtureIncludesGuard } from "./createFixtureIncludesGuard.adapter";
import type { TaskManagerFixtureRuntime } from "./TaskManagerFixtureRuntime.types";
import type { FixtureProcessHandle } from "./FixtureProcess.types";
import type {
  TaskManagerFixtureReceipt,
  FixtureCleanupResult,
  TaskManagerFixtureOutcome,
} from "./TaskManagerAcceptance.types";
type FixtureTypeConfig = {
  include: string[];
  compilerOptions: { strict: boolean };
};
type FixtureStoredResult = {
  outcome: TaskManagerFixtureOutcome;
  resourceCleanup: FixtureCleanupResult;
};
const typesFlags = {
  imageImportsEnabled: true,
  hasAppDir: true,
  hasPagesDir: false,
  strictRouteTypes: false,
  typedRoutes: false,
};
async function fixture(context: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "realize-task-stage-"));
  const storage = new WorkspaceFs(root);
  createDossier(storage, {
    key: "fixture",
    title: "Browser lifecycle fixture",
  });
  storage.write(
    "tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: { strict: true },
        include: ["source.ts", "foreign/types/**/*.ts"],
      },
      null,
      2,
    ) + "\n",
  );
  await writeAppTypeDeclarations({
    baseDir: root,
    distDir: ".next",
    ...typesFlags,
  });
  context.after(() => {
    storage.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const options = createTaskManagerFixtureOptions(
    {
      NODE_ENV: "test",
      TASK_BROWSER_TASK: ".ai-workspace/tasks/fixture",
      DATABASE_URI: "postgres://fixture:dummy@127.0.0.1:5432/source",
    },
    root,
    "0123456789abcdef",
  );
  return { root, storage, options };
}
function runtime(
  root: string,
  behavior: {
    failInitialize?: boolean;
    browserCode?: number | null;
    abort?: AbortController;
    stopBlocked?: boolean;
    stopTransient?: boolean;
    dbCloseFails?: boolean;
    waitFails?: boolean;
  } = {},
): { dependencies: TaskManagerFixtureRuntime; events: string[] } {
  const events: string[] = [];
  let count = 0;
  const dependencies: TaskManagerFixtureRuntime = {
    database: () => ({
      name: "realize_task_browser_fixture_test",
      uri: "postgres://fixture:dummy@127.0.0.1:5432/fake",
      async initialize() {
        events.push("db:init");
        if (behavior.failInitialize) throw new Error("FIXTURE_INIT_FAILED");
      },
      async close() {
        events.push("db:close");
        if (behavior.dbCloseFails) throw Error("close fake error");
        return { quiescent: true, errors: [] };
      },
    }),
    prepareIncludes: createFixtureIncludesGuard,
    allocatePort: async () => 54321,
    waitForServer: async () => {
      events.push("ready");
      if (behavior.waitFails) throw Error("FIXTURE_WARMUP_FAILED");
    },
    startProcess: (_args, options) => {
      const kind = count++ === 0 ? "server" : "browser";
      events.push(kind + ":start");
      if (options.logFile)
        fs.writeFileSync(options.logFile, kind + " evidence\n");
      let stopped: Promise<{ quiescent: boolean; reason?: string }> | undefined;
      const handle = {
        child: {
          pid: kind === "server" ? 101 : 102,
          exitCode: null,
          signalCode: null,
        },
        done:
          kind === "browser" && behavior.abort
            ? new Promise<number | null>(() => {})
            : Promise.resolve(behavior.browserCode ?? 0),
        stop: () =>
          (stopped ??= Promise.resolve().then(() => {
            events.push(kind + ":stop");
            return (behavior.stopBlocked || behavior.stopTransient) &&
              kind === "server"
              ? {
                  quiescent: false,
                  reason: "fixture_process_new_identity_unowned",
                }
              : { quiescent: true };
          })),
        async confirmQuiescence() {
          events.push(kind + ":confirm");
          return behavior.stopBlocked && kind === "server"
            ? {
                quiescent: false,
                reason: "fixture_process_new_identity_unowned",
              }
            : { quiescent: true };
        },
      } as unknown as FixtureProcessHandle;
      if (kind === "browser" && behavior.abort)
        setImmediate(() => behavior.abort!.abort());
      return handle;
    },
  };
  return { dependencies, events };
}
test("Выбор задачи обязателен, дата старой Foundation не подставляется и source DB должен быть loopback", () => {
  for (const environment of [
    { DATABASE_URI: "postgres://x@127.0.0.1/db" },
    {
      TASK_BROWSER_TASK: ".ai-workspace/tasks/../foreign",
      DATABASE_URI: "postgres://x@127.0.0.1/db",
    },
    {
      TASK_BROWSER_TASK: ".ai-workspace/tasks/fixture",
      DATABASE_URI: "postgres://x@remote.invalid/db",
    },
  ])
    assert.throws(() =>
      createTaskManagerFixtureOptions({ NODE_ENV: "test", ...environment }),
    );
});

test("Квитанция fixture не пересекает чужое ready дерево до создания группы и ресурсов", async (context) => {
  for (const [label, registeredPath, receiptPath, settled] of [
    [
      "внутри незавершённого дерева",
      "logs/foreign-receipt",
      "logs/foreign-receipt/own",
      false,
    ],
    [
      "на месте готового дерева",
      "logs/foreign-receipt",
      "logs/foreign-receipt",
      true,
    ],
    [
      "поверх предка готового дерева",
      "logs/foreign-receipt/child",
      "logs/foreign-receipt",
      true,
    ],
  ] as const) {
    await context.test(label, async (context) => {
      const { root, storage, options } = await fixture(context);
      const foreign = beginWorkspaceProducerGroup(storage, options.localKey, {
        artifacts: [{ path: registeredPath, category: "log" }],
      });
      const sentinel = `${options.task}/${registeredPath}/sentinel.log`;
      storage.write(sentinel, "Чужое доказательство\n");
      if (settled)
        assert.equal(
          finalizeWorkspaceProducerGroup(storage, foreign, {
            quiescent: true,
            cleanupTemporary: false,
          }).status,
          "completed",
        );
      options.paths.lifecycleDirectory = receiptPath;
      options.paths.lifecycle = `${receiptPath}/receipt.json`;
      const before = {
        task: storage.read(`${options.task}/TASK.md`),
        manifest: storage.read(`${options.task}/artifact-manifest.json`),
        sentinel: storage.read(sentinel),
      };
      const { dependencies, events } = runtime(root);
      const unexpectedResource = () => {
        events.push("unexpected-resource");
        throw new Error("FIXTURE_UNEXPECTED_RESOURCE");
      };
      Object.assign(dependencies, {
        processContainment: unexpectedResource,
        database: unexpectedResource,
        prepareIncludes: unexpectedResource,
        allocatePort: unexpectedResource,
        waitForServer: unexpectedResource,
        startProcess: unexpectedResource,
      });
      await assert.rejects(
        runTaskManagerFixture(
          options,
          new AbortController().signal,
          dependencies,
        ),
        { code: "artifact_already_registered" },
      );
      assert.deepEqual(events, []);
      assert.deepEqual(storage.read(`${options.task}/TASK.md`), before.task);
      assert.deepEqual(
        storage.read(`${options.task}/artifact-manifest.json`),
        before.manifest,
      );
      assert.deepEqual(storage.read(sentinel), before.sentinel);
      for (const output of [
        options.paths.logs,
        options.paths.screenshots,
        options.paths.temporary,
      ])
        assert.equal(storage.exists(`${options.task}/${output}`), false);
    });
  }
});

test("Ранняя receipt группа отклоняет позднюю чужую регистрацию, а runtime не перенаправляет квитанцию", async (context) => {
  const { root, storage, options } = await fixture(context);
  const originalDirectory = options.paths.lifecycleDirectory;
  const originalReceipt = options.paths.lifecycle;
  const originalAttempt = options.attemptId;
  const { dependencies, events } = runtime(root);
  const waitForServer = dependencies.waitForServer;
  dependencies.waitForServer = async (...args) => {
    await waitForServer(...args);
    assert.throws(
      () =>
        beginWorkspaceProducerGroup(storage, options.localKey, {
          artifacts: [{ path: originalDirectory, category: "log" }],
        }),
      { code: "artifact_already_registered" },
    );
    options.paths.lifecycleDirectory = "logs/foreign-after-start";
    options.paths.lifecycle = "logs/foreign-after-start/receipt.json";
    options.attemptId = randomUUID();
    options.localKey = "foreign-after-start";
  };
  const result = await runTaskManagerFixture(
    options,
    new AbortController().signal,
    dependencies,
  );
  assert.equal(result.outcome, "passed");
  assert.equal(result.receiptLifecycle.status, "completed");
  assert.equal(result.receiptPath, originalReceipt);
  assert.equal(
    (
      storage.json(
        `${options.task}/${originalReceipt}`,
      ) as TaskManagerFixtureReceipt
    ).attemptId,
    originalAttempt,
  );
  assert.equal(
    storage.exists(`${options.task}/${options.paths.lifecycleDirectory}`),
    false,
  );
  assert.ok(events.includes("db:close"));
});

for (const [label, behavior, outcome, code] of [
  ["успех", {}, "passed", 0],
  ["ошибка browser", { browserCode: 1 }, "failed", 1],
  ["ранняя ошибка DB", { failInitialize: true }, "failed", 1],
  ["ошибка readiness", { waitFails: true }, "failed", 1],
] as const) {
  test(`Fixture: ${label} сохраняет evidence и очищает только свой tmp`, async (context) => {
    const { root, storage, options } = await fixture(context);
    storage.mkdir(".ai-workspace/tasks/fixture/tmp/foreign");
    storage.write(".ai-workspace/tasks/fixture/tmp/foreign/sentinel", "keep");
    const before = readDossier(storage, "fixture");
    const { dependencies, events } = runtime(root, behavior);
    const result = await runTaskManagerFixture(
      options,
      new AbortController().signal,
      dependencies,
    );
    assert.equal(result.outcome, outcome);
    assert.equal(result.exitCode, code);
    assert.equal(result.lifecycleStatus, "completed");
    assert.equal(result.receiptLifecycle.status, "completed");
    assert.equal(result.receiptLifecycle.writeState, "written");
    assert.ok(!storage.exists(`${options.task}/${options.paths.temporary}`));
    assert.equal(
      storage.read(`${options.task}/tmp/foreign/sentinel`).toString(),
      "keep",
    );
    assert.ok(
      storage.exists(
        `${options.task}/${options.paths.logs}/fixture-result.json`,
      ),
    );
    assert.ok(storage.exists(`${options.task}/${options.paths.screenshots}`));
    if (events.includes("server:start"))
      assert.equal(
        storage
          .read(`${options.task}/${options.paths.logs}/server.log`)
          .toString(),
        "server evidence\n",
      );
    if (events.includes("browser:start"))
      assert.equal(
        storage
          .read(`${options.task}/${options.paths.logs}/test.log`)
          .toString(),
        "browser evidence\n",
      );
    const manifest = readArtifacts(storage, readDossier(storage, "fixture"));
    assert.ok(manifest.artifacts.every((a) => a.producer.settled));
    assert.equal(manifest.artifacts.length, 4);
    const receipt = storage.json(
      `${options.task}/${options.paths.lifecycle}`,
    ) as TaskManagerFixtureReceipt;
    assert.equal(receipt.main.status, "completed");
    assert.equal(receipt.receipt.state, "open");
    assert.equal(receipt.receipt.writersQuiescent, true);
    assert.equal(
      manifest.artifacts.find((a) => a.category === "temporary")?.state,
      "deleted",
    );
    assert.equal(readDossier(storage, "fixture").bodyHash, before.bodyHash);
    assert.equal(readDossier(storage, "fixture").meta?.status.category, "open");
    if (events.includes("browser:stop"))
      assert.ok(events.indexOf("browser:stop") < events.indexOf("server:stop"));
    assert.ok(events.includes("db:close"));
  });
}
test("Прерывание размыкает browser.done и завершает browser перед Next, сохраняя cancelled result", async (context) => {
  const { root, storage, options } = await fixture(context);
  const abort = new AbortController();
  const { dependencies, events } = runtime(root, { abort });
  const result = await runTaskManagerFixture(
    options,
    abort.signal,
    dependencies,
  );
  assert.equal(result.outcome, "cancelled");
  assert.equal(result.exitCode, 130);
  assert.equal(result.lifecycleStatus, "completed");
  assert.ok(events.indexOf("browser:stop") < events.indexOf("server:stop"));
  assert.ok(!storage.exists(`${options.task}/${options.paths.temporary}`));
  assert.equal(
    (
      storage.json(
        `${options.task}/${options.paths.logs}/fixture-result.json`,
      ) as FixtureStoredResult
    ).outcome,
    "cancelled",
  );
});
test("Неизвестные процессы блокируют settle/cleanup и сохраняют tmp, не останавливая чужую работу", async (context) => {
  const { root, storage, options } = await fixture(context);
  const { dependencies } = runtime(root, { stopBlocked: true });
  let restored = false;
  dependencies.prepareIncludes = async () => ({
    async restore() {
      restored = true;
    },
  });
  const result = await runTaskManagerFixture(
    options,
    new AbortController().signal,
    dependencies,
  );
  assert.equal(result.exitCode, 1);
  assert.equal(result.lifecycleStatus, "blocked");
  assert.equal(restored, false);
  assert.ok(storage.exists(`${options.task}/${options.paths.temporary}`));
  assert.ok(
    readArtifacts(storage, readDossier(storage, "fixture")).artifacts.some(
      (a) => !a.producer.settled,
    ),
  );
  assert.ok(
    (
      storage.json(
        `${options.task}/${options.paths.logs}/fixture-result.json`,
      ) as FixtureStoredResult
    ).resourceCleanup.errors.includes("fixture_process_new_identity_unowned"),
  );
});
test("Ошибка close DB не пропускает восстановление inputs и сохраняет tmp без ложного passed", async (context) => {
  const { root, storage, options } = await fixture(context);
  const { dependencies } = runtime(root, { dbCloseFails: true });
  let restored = false;
  dependencies.prepareIncludes = async () => ({
    async restore() {
      restored = true;
    },
  });
  const result = await runTaskManagerFixture(
    options,
    new AbortController().signal,
    dependencies,
  );
  assert.ok(restored);
  assert.equal(result.outcome, "failed");
  assert.equal(result.lifecycleStatus, "blocked");
  assert.ok(storage.exists(`${options.task}/${options.paths.temporary}`));
});
test("Восстановление удаляет только свои новые includes и возвращает generated pointer штатным Next SDK", async (context) => {
  const { root, storage, options } = await fixture(context);
  const guard = await createFixtureIncludesGuard(root, options.paths.distDir);
  const config = storage.json("tsconfig.json") as FixtureTypeConfig;
  config.include.push(
    `${options.paths.distDir}/types/**/*.ts`,
    `${options.paths.distDir}/dev/types/**/*.ts`,
    "another-agent/types/**/*.ts",
  );
  config.compilerOptions.strict = false;
  storage.writeJson("tsconfig.json", config);
  await writeAppTypeDeclarations({
    baseDir: root,
    distDir: options.paths.distDir + "/dev",
    ...typesFlags,
  });
  await guard.restore();
  const after = storage.json("tsconfig.json") as FixtureTypeConfig;
  assert.deepEqual(after.include, [
    "source.ts",
    "foreign/types/**/*.ts",
    "another-agent/types/**/*.ts",
  ]);
  assert.equal(after.compilerOptions.strict, false);
  assert.match(
    storage.read("next-env.d.ts").toString(),
    /\.next\/types\/routes/,
  );
  assert.ok(
    !storage.read("next-env.d.ts").toString().includes(options.paths.temporary),
  );
});
test("Чужой generated pointer и ранее существующие own includes сохраняются", async (context) => {
  const { root, storage, options } = await fixture(context);
  const config = storage.json("tsconfig.json") as FixtureTypeConfig;
  config.include.push(`${options.paths.distDir}/types/**/*.ts`);
  storage.writeJson("tsconfig.json", config);
  const guard = await createFixtureIncludesGuard(root, options.paths.distDir);
  await writeAppTypeDeclarations({
    baseDir: root,
    distDir: "another-agent/next",
    ...typesFlags,
  });
  await guard.restore();
  assert.ok(
    (storage.json("tsconfig.json") as FixtureTypeConfig).include.includes(
      `${options.paths.distDir}/types/**/*.ts`,
    ),
  );
  assert.ok(
    storage.read("next-env.d.ts").toString().includes("another-agent/next"),
  );
});
test("Непредвиденные declarations не перезаписываются и удерживают свой tmp для review", async (context) => {
  const { root, storage, options } = await fixture(context);
  const guard = await createFixtureIncludesGuard(root, options.paths.distDir);
  await writeAppTypeDeclarations({
    baseDir: root,
    distDir: options.paths.distDir,
    ...typesFlags,
  });
  const text =
    storage.read("next-env.d.ts").toString() + "// чужое изменение\n";
  storage.write("next-env.d.ts", text);
  await assert.rejects(guard.restore(), /FIXTURE_NEXT_DECLARATIONS_CONFLICT/);
  assert.equal(storage.read("next-env.d.ts").toString(), text);
});

test("Generated root next-env pointer удерживает referenced tmp до восстановления", async (context) => {
  const { root, storage, options } = await fixture(context);
  const group = beginWorkspaceProducerGroup(storage, "fixture", {
    attemptId: options.attemptId,
    artifacts: [
      {
        path: options.paths.temporary,
        category: "temporary",
        retention: {
          mode: "temporary",
          pinned: false,
          keepReason: null,
          referencedBy: [],
        },
      },
    ],
  });
  await writeAppTypeDeclarations({
    baseDir: root,
    distDir: options.paths.distDir + "/dev",
    ...typesFlags,
  });
  const result = finalizeWorkspaceProducerGroup(storage, group, {
    quiescent: true,
    cleanupTemporary: true,
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "source_reference_active");
  assert.ok(storage.exists(`${options.task}/${options.paths.temporary}`));
});

test("Нестандартный исходный generated файл отклоняется до запуска Next без потери declarations", async (context) => {
  const { root, storage, options } = await fixture(context);
  const custom =
    storage.read("next-env.d.ts").toString() +
    "declare const foreignType: string;\n";
  storage.write("next-env.d.ts", custom);
  await assert.rejects(
    createFixtureIncludesGuard(root, options.paths.distDir),
    /FIXTURE_NEXT_DECLARATIONS_UNRECOGNIZED/,
  );
  assert.equal(storage.read("next-env.d.ts").toString(), custom);
});

test("pg host/hostaddr query overrides отклоняются options и DB adapter до Client создания", () => {
  for (const query of [
    "host=remote.invalid",
    "%68ost=remote.invalid",
    "hostaddr=203.0.113.1",
    "host=127.0.0.1&host=remote.invalid",
  ]) {
    const uri = "postgres://fixture:dummy@127.0.0.1:5432/source?" + query;
    assert.throws(
      () =>
        createTaskManagerFixtureOptions({
          NODE_ENV: "test",
          TASK_BROWSER_TASK: ".ai-workspace/tasks/fixture",
          DATABASE_URI: uri,
        }),
      /TASK_BROWSER_DATABASE_NOT_LOOPBACK/,
    );
    assert.throws(
      () => createFixtureDatabase(new URL(uri), "0123456789abcdef"),
      /TASK_BROWSER_DATABASE_NOT_LOOPBACK/,
    );
  }
});

test("Существующий sibling lifecycle receipt не перезаписывается при collision", async (context) => {
  const { root, storage, options } = await fixture(context);
  const file = `${options.task}/${options.paths.lifecycle}`;
  const sentinel = "previous retained receipt\n";
  storage.write(file, sentinel);
  const { dependencies } = runtime(root);
  await assert.rejects(
    runTaskManagerFixture(options, new AbortController().signal, dependencies),
    { code: "producer_path_exists" },
  );
  assert.equal(storage.read(file).toString(), sentinel);
});

test("Итоговая quiescence повторно проверяется после DB close; transient sibling не даёт ложный blocked", async (context) => {
  const { root, options } = await fixture(context);
  const { dependencies, events } = runtime(root, { stopTransient: true });
  const result = await runTaskManagerFixture(
    options,
    new AbortController().signal,
    dependencies,
  );
  assert.equal(result.lifecycleStatus, "completed");
  assert.equal(result.resourceCleanup.quiescent, true);
  assert.ok(events.indexOf("db:close") < events.indexOf("server:confirm"));
});

test("Восстановление tsconfig сохраняет его permissions независимо от umask", async (context) => {
  const { root, storage, options } = await fixture(context);
  fs.chmodSync(path.join(root, "tsconfig.json"), 0o664);
  const guard = await createFixtureIncludesGuard(root, options.paths.distDir);
  const config = storage.json("tsconfig.json") as FixtureTypeConfig;
  config.include.push(options.paths.distDir + "/types/**/*.ts");
  storage.writeJson("tsconfig.json", config);
  fs.chmodSync(path.join(root, "tsconfig.json"), 0o664);
  const previous = process.umask(0o077);
  try {
    await guard.restore();
    assert.equal(
      fs.statSync(path.join(root, "tsconfig.json")).mode & 0o777,
      0o664,
    );
  } finally {
    process.umask(previous);
  }
});

test("CREATE SQLSTATE не превращает transport/FATAL/unknown исход в подтверждённый отказ", () => {
  for (const error of [
    { code: "08006", severity: "ERROR" },
    { code: "57P01", severity: "FATAL" },
    { code: "42P04", severity: "FATAL" },
    { code: "XX000", severity: "ERROR" },
    { code: "42501" },
    new Error("connection lost"),
  ])
    assert.equal(isDefiniteFixtureCreateRejection(error), false);
  for (const code of ["42P04", "42501", "42601", "22023", "0A000"])
    assert.equal(
      isDefiniteFixtureCreateRejection({ code, severity: "ERROR" }),
      true,
    );
});

test("DB quiescent:false с пустым errors всё равно блокирует settle/cleanup", async (context) => {
  const { root, storage, options } = await fixture(context);
  const { dependencies } = runtime(root);
  const database = dependencies.database;
  dependencies.database = (...args) => ({
    ...database(...args),
    async close() {
      return { quiescent: false, errors: [] };
    },
  });
  const result = await runTaskManagerFixture(
    options,
    new AbortController().signal,
    dependencies,
  );
  assert.equal(result.lifecycleStatus, "blocked");
  assert.ok(
    result.resourceCleanup.errors.includes("FIXTURE_DATABASE_NOT_QUIESCENT"),
  );
  assert.ok(storage.exists(`${options.task}/${options.paths.temporary}`));
});

test("Symlink next-env отклоняется при prepare без чтения или изменения target", async (context) => {
  const { root, storage, options } = await fixture(context);
  const file = path.join(root, "next-env.d.ts"),
    target = path.join(root, "foreign.d.ts"),
    text = storage.read("next-env.d.ts");
  fs.renameSync(file, target);
  fs.symlinkSync(target, file);
  await assert.rejects(
    createFixtureIncludesGuard(root, options.paths.distDir),
    /FIXTURE_NEXT_DECLARATIONS_CONFLICT/,
  );
  assert.deepEqual(fs.readFileSync(target), text);
});

test("Подмена next-env на symlink перед restore не даёт SDK перезаписать чужой target", async (context) => {
  const { root, storage, options } = await fixture(context);
  const guard = await createFixtureIncludesGuard(root, options.paths.distDir);
  await writeAppTypeDeclarations({
    baseDir: root,
    distDir: options.paths.distDir,
    ...typesFlags,
  });
  const file = path.join(root, "next-env.d.ts"),
    target = path.join(root, "foreign.d.ts"),
    text = storage.read("next-env.d.ts");
  fs.renameSync(file, target);
  fs.symlinkSync(target, file);
  await assert.rejects(guard.restore(), /FIXTURE_NEXT_DECLARATIONS_CONFLICT/);
  assert.deepEqual(fs.readFileSync(target), text);
});

for (const blocked of [false, true])
  test(`Contained lifecycle reap ${blocked ? "blocked" : "completed"} сверяется после DB close до confirm`, async (context) => {
    const { root, storage, options } = await fixture(context);
    const { dependencies, events } = runtime(root);
    let restored = false;
    dependencies.prepareIncludes = async () => ({
      async restore() {
        restored = true;
      },
    });
    dependencies.processContainment = () => ({
      unit: "fixture",
      controlGroup: "/fixture",
      startProcess: dependencies.startProcess,
      async reapResidualWriters() {
        events.push("scope:reap");
        return blocked
          ? { quiescent: false, reason: "FIXTURE_CONTAINMENT_CHANGED" }
          : { quiescent: true };
      },
    });
    const result = await runTaskManagerFixture(
      options,
      new AbortController().signal,
      dependencies,
    );
    assert.ok(events.indexOf("db:close") < events.indexOf("scope:reap"));
    assert.ok(events.indexOf("scope:reap") < events.indexOf("server:confirm"));
    assert.equal(result.lifecycleStatus, blocked ? "blocked" : "completed");
    assert.equal(restored, !blocked);
    assert.equal(
      storage.exists(`${options.task}/${options.paths.temporary}`),
      blocked,
    );
  });

/** Синтетический заполненный manifest проверяет лимит регистрации без создания тысячи деревьев. */
function seedArtifactCapacity(storage: WorkspaceFs, count: number) {
  const dossier = readDossier(storage, "fixture");
  assert.ok(dossier.meta);
  const manifest = readArtifacts(storage, dossier);
  manifest.artifacts = Array.from(
    { length: count },
    (_, index): WorkspaceArtifact => ({
      id: randomUUID(),
      revision: 1,
      path: `logs/preexisting-${index}`,
      category: "log",
      bytes: 0,
      hash: "0".repeat(64),
      state: "ready",
      createdAt: dossier.meta!.createdAt,
      stageId: null,
      attemptId: null,
      producer: {
        id: "synthetic-capacity",
        pid: null,
        identity: null,
        settled: true,
      },
      retention: {
        mode: "retain",
        pinned: true,
        keepReason: "Синтетическая проверка лимита",
        referencedBy: [],
      },
    }),
  );
  storage.writeJson(`${dossier.base}/artifact-manifest.json`, manifest);
}

for (const count of [1021, 1020])
  test(`V15: ${count} прежних артефактов оставляют квитанцию до запуска ресурсов`, async (context) => {
    const { root, storage, options } = await fixture(context);
    seedArtifactCapacity(storage, count);
    const { dependencies, events } = runtime(root);
    const prepare = dependencies.prepareIncludes;
    dependencies.prepareIncludes = async (...args) => {
      events.push("inputs:prepare");
      return prepare(...args);
    };
    const result = await runTaskManagerFixture(
      options,
      new AbortController().signal,
      dependencies,
    );
    const manifest = readArtifacts(storage, readDossier(storage, "fixture"));
    const receipt = manifest.artifacts.find(
      (artifact) => artifact.path === options.paths.lifecycleDirectory,
    );
    assert.ok(receipt);
    assert.equal(receipt.retention.mode, "retain");
    assert.equal(receipt.retention.pinned, true);
    assert.equal(receipt.producer.settled, true);
    assert.equal(result.receiptLifecycle.status, "completed");
    assert.equal(
      storage.exists(`${options.task}/${options.paths.lifecycle}`),
      true,
    );
    if (count === 1021) {
      assert.deepEqual(events, []);
      assert.equal(result.lifecycle.stage, "begin");
      assert.equal(result.lifecycle.status, "blocked");
      assert.equal(manifest.artifacts.length, 1022);
      assert.equal(
        storage.exists(`${options.task}/${options.paths.logs}`),
        false,
      );
      assert.equal(
        storage.exists(`${options.task}/${options.paths.screenshots}`),
        false,
      );
      assert.equal(
        storage.exists(`${options.task}/${options.paths.temporary}`),
        false,
      );
    } else {
      assert.equal(result.outcome, "passed");
      assert.equal(result.lifecycleStatus, "completed");
      assert.equal(manifest.artifacts.length, 1024);
      assert.ok(events.includes("db:init"));
      assert.ok(events.includes("browser:start"));
    }
  });

test("V15: конкурентная регистрация после receipt даёт ранний отказ main и не отнимает квитанцию", async (context) => {
  const { root, storage, options } = await fixture(context);
  seedArtifactCapacity(storage, 1020);
  const { dependencies, events } = runtime(root);
  let begins = 0;
  dependencies.producerGroups = {
    begin(fs, key, input) {
      if (++begins === 2)
        beginWorkspaceProducerGroup(fs, key, {
          artifacts: [{ path: "logs/concurrent", category: "log" }],
        });
      return beginWorkspaceProducerGroup(fs, key, input);
    },
    finalize: finalizeWorkspaceProducerGroup,
  };
  const result = await runTaskManagerFixture(
    options,
    new AbortController().signal,
    dependencies,
  );
  assert.deepEqual(events, []);
  assert.equal(result.lifecycle.stage, "begin");
  assert.equal(result.receiptLifecycle.status, "completed");
  const artifacts = readArtifacts(
    storage,
    readDossier(storage, "fixture"),
  ).artifacts;
  assert.equal(artifacts.length, 1022);
  assert.equal(
    artifacts.find((a) => a.path === "logs/concurrent")?.producer.settled,
    false,
  );
  assert.equal(
    artifacts.find((a) => a.path === options.paths.lifecycleDirectory)?.producer
      .settled,
    true,
  );
});

for (const phase of ["begin", "finalize"] as const)
  test(`V15: partial main ${phase} разрешает только bytes открытой receipt`, async (context) => {
    const { root, storage, options } = await fixture(context);
    const { dependencies, events } = runtime(root);
    let beforeTask: Buffer | undefined;
    let beforeManifest: Buffer | undefined;
    let beforePending: Buffer | undefined;
    let metadataAfterFault = 0;
    const finalized: string[][] = [];
    let begins = 0;
    const interrupt = <T>(fs: WorkspaceFs, operation: () => T): T => {
      const write = fs.write.bind(fs);
      let injected = false;
      fs.write = (file, bytes, exclusive) => {
        if (
          injected &&
          (file.endsWith("/TASK.md") ||
            file.endsWith("/artifact-manifest.json"))
        )
          metadataAfterFault++;
        write(file, bytes, exclusive);
        if (!injected && file === `${options.task}/artifact-manifest.json`) {
          injected = true;
          beforeTask = fs.read(`${options.task}/TASK.md`);
          beforeManifest = fs.read(`${options.task}/artifact-manifest.json`);
          beforePending = fs.read(
            workspaceOperationPaths(options.localKey).pending,
            64 * 1024 * 1024,
          );
          throw new Error("FIXTURE_PARTIAL_METADATA");
        }
      };
      return operation();
    };
    dependencies.producerGroups = {
      begin(fs, key, input) {
        begins++;
        return phase === "begin" && begins === 2
          ? interrupt(fs, () => beginWorkspaceProducerGroup(fs, key, input))
          : beginWorkspaceProducerGroup(fs, key, input);
      },
      finalize(fs, group, input) {
        finalized.push([...group.paths]);
        return phase === "finalize" && group.paths.includes(options.paths.logs)
          ? interrupt(fs, () =>
              finalizeWorkspaceProducerGroup(fs, group, input),
            )
          : finalizeWorkspaceProducerGroup(fs, group, input);
      },
    };
    const result = await runTaskManagerFixture(
      options,
      new AbortController().signal,
      dependencies,
    );
    assert.equal(result.lifecycle.status, "blocked");
    assert.equal(result.receiptLifecycle.status, "open");
    assert.equal(result.receiptLifecycle.writeState, "written");
    assert.equal(result.receiptLifecycle.settlement, "unsettled");
    assert.ok(result.receiptLifecycle.operation);
    assert.equal(metadataAfterFault, 0);
    assert.deepEqual(storage.read(`${options.task}/TASK.md`), beforeTask);
    assert.deepEqual(
      storage.read(`${options.task}/artifact-manifest.json`),
      beforeManifest,
    );
    assert.deepEqual(
      storage.read(
        workspaceOperationPaths(options.localKey).pending,
        64 * 1024 * 1024,
      ),
      beforePending,
    );
    const receipt = storage.json(
      `${options.task}/${options.paths.lifecycle}`,
    ) as TaskManagerFixtureReceipt;
    assert.equal(receipt.receipt.state, "open");
    assert.equal(receipt.main.status, "blocked");
    assert.equal(
      finalized.some((paths) =>
        paths.includes(options.paths.lifecycleDirectory),
      ),
      false,
    );
    assert.equal(
      readArtifacts(storage, readDossier(storage, "fixture")).artifacts.find(
        (a) => a.path === options.paths.lifecycleDirectory,
      )?.producer.settled,
      false,
    );
    if (phase === "begin") assert.deepEqual(events, []);
    else assert.ok(events.includes("db:close"));
  });

test("V15: blocked resources без pending не мешают settle отдельной квитанции", async (context) => {
  const { root, storage, options } = await fixture(context);
  const { dependencies } = runtime(root, { stopBlocked: true });
  const result = await runTaskManagerFixture(
    options,
    new AbortController().signal,
    dependencies,
  );
  assert.equal(result.lifecycle.status, "blocked");
  assert.equal(result.resourceCleanup.quiescent, false);
  assert.equal(result.receiptLifecycle.status, "completed");
  assert.equal(result.receiptLifecycle.writersQuiescent, true);
  assert.equal(result.receiptLifecycle.settlement, "settled");
  assert.equal(
    storage.exists(workspaceOperationPaths(options.localKey).pending),
    false,
  );
  const artifacts = readArtifacts(
    storage,
    readDossier(storage, "fixture"),
  ).artifacts;
  assert.equal(
    artifacts.find((a) => a.path === options.paths.lifecycleDirectory)?.producer
      .settled,
    true,
  );
  assert.equal(
    artifacts.find((a) => a.path === options.paths.logs)?.producer.settled,
    false,
  );
});

test("V15: writer в receipt каталоге запрещает её запись и settle независимо от main", async (context) => {
  const { root, storage, options } = await fixture(context);
  const { dependencies } = runtime(root);
  let writer: ChildProcess | undefined;
  dependencies.waitForServer = async () => {
    writer = spawn(
      process.execPath,
      ["-e", 'process.stdout.write("ready\\n");setInterval(()=>{},1000);'],
      {
        cwd: path.join(root, options.task, options.paths.lifecycleDirectory),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    await once(writer.stdout!, "data");
  };
  try {
    const result = await runTaskManagerFixture(
      options,
      new AbortController().signal,
      dependencies,
    );
    assert.equal(result.lifecycle.status, "completed");
    assert.equal(result.receiptLifecycle.status, "unwritten");
    assert.equal(result.receiptLifecycle.writersQuiescent, false);
    assert.ok(result.receiptLifecycle.writerCoverage);
    assert.ok(result.receiptLifecycle.writerCoverage.referenceCount > 0);
    assert.equal(
      result.receiptLifecycle.reason,
      "fixture_receipt_writers_unconfirmed",
    );
    assert.equal(
      storage.exists(`${options.task}/${options.paths.lifecycle}`),
      false,
    );
    assert.equal(
      readArtifacts(storage, readDossier(storage, "fixture")).artifacts.find(
        (a) => a.path === options.paths.lifecycleDirectory,
      )?.producer.settled,
      false,
    );
  } finally {
    if (writer && writer.exitCode === null) {
      const exited = once(writer, "exit");
      writer.kill("SIGKILL");
      await exited;
    }
  }
});

test("V15: чужое изменение receipt binding возвращает unwritten/unknown без ложной квитанции", async (context) => {
  const { root, storage, options } = await fixture(context);
  const { dependencies } = runtime(root);
  dependencies.waitForServer = async () => {
    const dossier = readDossier(storage, "fixture");
    const manifest = readArtifacts(storage, dossier);
    const receipt = manifest.artifacts.find(
      (a) => a.path === options.paths.lifecycleDirectory,
    );
    assert.ok(receipt);
    receipt.revision++;
    storage.writeJson(`${options.task}/artifact-manifest.json`, manifest);
  };
  const result = await runTaskManagerFixture(
    options,
    new AbortController().signal,
    dependencies,
  );
  assert.equal(result.receiptLifecycle.status, "unwritten");
  assert.equal(result.receiptLifecycle.settlement, "unknown");
  assert.equal(result.receiptLifecycle.writeState, "unwritten");
  assert.equal(
    storage.exists(`${options.task}/${options.paths.lifecycle}`),
    false,
  );
});

test("V15: ошибка после записи receipt подтверждает bytes readback и оставляет producer open", async (context) => {
  const { root, storage, options } = await fixture(context);
  const { dependencies } = runtime(root);
  dependencies.producerGroups = {
    begin(fs, key, input) {
      const group = beginWorkspaceProducerGroup(fs, key, input);
      if (input.artifacts[0].path === options.paths.lifecycleDirectory) {
        const write = fs.write.bind(fs);
        fs.write = (file, bytes, exclusive) => {
          write(file, bytes, exclusive);
          if (file === `${options.task}/${options.paths.lifecycle}`)
            throw new Error("FIXTURE_RECEIPT_WRITE_INTERRUPTED");
        };
      }
      return group;
    },
    finalize: finalizeWorkspaceProducerGroup,
  };
  const result = await runTaskManagerFixture(
    options,
    new AbortController().signal,
    dependencies,
  );
  assert.equal(result.receiptLifecycle.status, "open");
  assert.equal(result.receiptLifecycle.writeState, "written");
  assert.equal(result.receiptLifecycle.finalization, null);
  assert.equal(
    (
      storage.json(
        `${options.task}/${options.paths.lifecycle}`,
      ) as TaskManagerFixtureReceipt
    ).schemaVersion,
    1,
  );
  assert.equal(
    readArtifacts(storage, readDossier(storage, "fixture")).artifacts.find(
      (a) => a.path === options.paths.lifecycleDirectory,
    )?.producer.settled,
    false,
  );
});

test("V15: отказ основного fixture-result сохраняет независимую квитанцию и завершает только её", async (context) => {
  const { root, storage, options } = await fixture(context);
  const { dependencies } = runtime(root);
  dependencies.producerGroups = {
    begin(fs, key, input) {
      const group = beginWorkspaceProducerGroup(fs, key, input);
      if (input.artifacts[0].path === options.paths.logs) {
        const write = fs.write.bind(fs);
        fs.write = (file, bytes, exclusive) => {
          if (
            file === `${options.task}/${options.paths.logs}/fixture-result.json`
          )
            throw new Error("FIXTURE_MAIN_RESULT_UNWRITABLE");
          write(file, bytes, exclusive);
        };
      }
      return group;
    },
    finalize: finalizeWorkspaceProducerGroup,
  };
  const result = await runTaskManagerFixture(
    options,
    new AbortController().signal,
    dependencies,
  );
  assert.equal(result.lifecycle.status, "blocked");
  if (result.lifecycle.status === "blocked")
    assert.equal(result.lifecycle.reason, "FIXTURE_MAIN_RESULT_UNWRITABLE");
  assert.equal(result.receiptLifecycle.status, "completed");
  assert.equal(result.receiptLifecycle.writeState, "written");
  const artifacts = readArtifacts(
    storage,
    readDossier(storage, "fixture"),
  ).artifacts;
  assert.equal(
    artifacts.find((a) => a.path === options.paths.logs)?.producer.settled,
    false,
  );
  assert.equal(
    artifacts.find((a) => a.path === options.paths.lifecycleDirectory)?.producer
      .settled,
    true,
  );
});

test("V15: недоступный посторонний proc сохраняет bounded coverage без блокировки собственного receipt writer", async (context) => {
  const { root, storage, options } = await fixture(context);
  const coordinator = createFixtureReceiptCoordinator(
    storage,
    options,
    {
      begin: beginWorkspaceProducerGroup,
      finalize: finalizeWorkspaceProducerGroup,
    },
    (absolute) => {
      assert.equal(
        absolute,
        path.resolve(root, options.task, options.paths.lifecycleDirectory),
      );
      return {
        references: [],
        inaccessible: 1,
        scope:
          "accessible same-UID cwd/exe/fd/pathname argv only; environment not read",
      };
    },
  );
  const result = coordinator.finish({
    outcome: "failed",
    reason: "MAIN_NOT_STARTED",
    resourceCleanup: { quiescent: true, errors: [] },
    main: {
      stage: "begin",
      status: "blocked",
      reason: "MAIN_NOT_STARTED",
      settlement: "not_started",
      operation: null,
    },
  });
  assert.equal(result.status, "completed");
  assert.equal(result.writersQuiescent, true);
  assert.ok(result.writerCoverage);
  assert.equal(result.writerCoverage.referenceCount, 0);
  assert.equal(result.writerCoverage.inaccessible, 1);
  assert.equal(
    result.writerCoverage.scope,
    "accessible same-UID cwd/exe/fd/pathname argv only; environment not read",
  );
  const receipt = storage.json(
    `${options.task}/${options.paths.lifecycle}`,
  ) as TaskManagerFixtureReceipt;
  assert.deepEqual(receipt.receipt.writerCoverage, result.writerCoverage);
  const artifacts = readArtifacts(
    storage,
    readDossier(storage, "fixture"),
  ).artifacts;
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].producer.settled, true);
});
