/**
 * @file tests/e2e/support/taskManagerAcceptance/TaskManagerFixture.test.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Проверяет настоящий producer lifecycle fixture при success, failure и interruption без рабочей БД.
 * @see documentation/specifications/task-management-execution.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeAppTypeDeclarations } from "next/dist/lib/typescript/writeAppTypeDeclarations";
import { WorkspaceFs } from "../../../../.ai/tools/task-workspace/src/WorkspaceFs.adapter.mjs";
import { createDossier } from "../../../../.ai/tools/task-workspace/src/createDossier.service.mjs";
import {
  readDossier,
  readArtifacts,
} from "../../../../.ai/tools/task-workspace/src/Dossier.repository.mjs";
import {
  beginWorkspaceProducerGroup,
  finalizeWorkspaceProducerGroup,
} from "../../../../.ai/tools/task-workspace/src/workspaceProducerGroup.service.mjs";
import { isDefiniteFixtureCreateRejection } from "./FixtureDatabaseCreateOutcome.validator";
import { createFixtureDatabase } from "./createFixtureDatabase.adapter";
import { createTaskManagerFixtureOptions } from "./createTaskManagerFixtureOptions.config";
import { runTaskManagerFixture } from "./runTaskManagerFixture.service";
import { createFixtureIncludesGuard } from "./createFixtureIncludesGuard.adapter";
import type { TaskManagerFixtureRuntime } from "./TaskManagerFixtureRuntime.types";
import type { FixtureProcessHandle } from "./FixtureProcess.types";
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
    const manifest = readArtifacts(storage, readDossier(storage, "fixture"));
    assert.ok(manifest.artifacts.every((a) => a.producer.settled));
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
    storage.json(`${options.task}/${options.paths.logs}/fixture-result.json`)
      .outcome,
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
    storage
      .json(`${options.task}/${options.paths.logs}/fixture-result.json`)
      .resourceCleanup.errors.includes("fixture_process_new_identity_unowned"),
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
  const config = storage.json("tsconfig.json");
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
  const after = storage.json("tsconfig.json");
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
  const config = storage.json("tsconfig.json");
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
    storage
      .json("tsconfig.json")
      .include.includes(`${options.paths.distDir}/types/**/*.ts`),
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
    { code: "EEXIST" },
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
  const config = storage.json("tsconfig.json");
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
