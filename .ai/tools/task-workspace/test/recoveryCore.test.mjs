/**
 * @file .ai/tools/task-workspace/test/recoveryCore.test.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Проверяет допуск мутаций, устойчивые метаданные и индекс прежних журналов в собственных временных деревьях.
 * @see documentation/specifications/task-management-execution.md
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { WorkspaceFs } from "../src/filesystem/WorkspaceFs.adapter.mjs";
import { WorkspaceError } from "../src/Workspace.error.mjs";
import { runtimeRoot } from "../src/workspacePaths.config.mjs";
import { canonicalHash } from "../src/filesystem/canonicalHash.util.mjs";
import { withWorkspaceMutation } from "../src/recovery/withWorkspaceMutation.service.mjs";
import {
  planWorkspaceFile,
  commitWorkspaceMetadata,
  resumeWorkspaceMetadataOperation,
} from "../src/recovery/commitWorkspaceMetadata.service.mjs";
import {
  ensureWorkspaceRecoveryIndex,
  readWorkspaceRecoveryIndex,
} from "../src/recovery/ensureWorkspaceRecoveryIndex.service.mjs";
import { recoverWorkspaceOperation } from "../src/recovery/recoverWorkspaceOperation.service.mjs";
import {
  workspaceOperationPaths,
  readPendingWorkspaceOperation,
  readCompletedWorkspaceOperation,
  inspectLegacyWorkspaceOperation,
  prepareWorkspaceOperation,
  WORKSPACE_RECOVERY_INDEX_PATH,
  readWorkspaceLegacyReferences,
} from "../src/recovery/WorkspaceOperation.repository.mjs";

const KEY = "core-fixture";
const OWNER = "00000000-0000-4000-8000-000000000001";
/** @param {import('node:test').TestContext} context */
function fixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "realize-recovery-core-"));
  const storage = new WorkspaceFs(root);
  context.after(() => {
    storage.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, storage };
}
/** @param {string} [operationId] @returns {import('../src/recovery/WorkspaceOperation.types.ts').WorkspaceMutationOptions} */
function request(operationId = "fixture-status") {
  return { kind: "status", operationId, input: { expectedRevision: 1 } };
}
/** @param {() => unknown} operation @param {string} code */
function expectCode(operation, code) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof WorkspaceError);
    assert.equal(error.code, code);
    return true;
  });
}
/** @param {WorkspaceFs} storage @param {string} key @param {'prepared'|'completed'} [phase] */
function legacyCleanup(storage, key, phase = "prepared") {
  const requestId = randomUUID();
  const body = {
    schemaVersion: 1,
    requestId,
    localKey: key,
    localDossierId: OWNER,
    items: [{ artifactId: "fixture-artifact" }],
  };
  const plan = { ...body, hash: canonicalHash(body) };
  const file = `${runtimeRoot}/operations/${requestId}.json`;
  const journal = {
    schemaVersion: 1,
    kind: "cleanup",
    key,
    planHash: plan.hash,
    phase,
    taskBefore: { localKey: key, localDossierId: OWNER, revision: 1 },
    manifestBefore: { localDossierId: OWNER, revision: 1, artifacts: [] },
    bodyHash: "a".repeat(64),
    items: [{ phase: phase === "completed" ? "completed" : "prepared" }],
    ...(phase === "completed"
      ? { result: { requestId, status: "completed" } }
      : {}),
  };
  storage.writeJson(file, journal, true);
  return { requestId, plan, file, journal };
}

test("Prepared ограждает чужую мутацию; точный nested вызов использует один context и lock", (context) => {
  const { storage } = fixture(context);
  let taskLocks = 0;
  let prepared = 0;
  const withParent = storage.withParent.bind(storage);
  storage.withParent = (file, create, callback) => {
    if (file === `${runtimeRoot}/locks/${KEY}.lock`) taskLocks++;
    return withParent(file, create, callback);
  };
  const writeJson = storage.writeJson.bind(storage);
  storage.writeJson = (file, value, exclusive = false) => {
    if (file === workspaceOperationPaths(KEY).pending && exclusive) prepared++;
    return writeJson(file, value, exclusive);
  };
  const result = withWorkspaceMutation(storage, KEY, request(), (outer) => {
    outer.prepare({
      localDossierId: OWNER,
      data: {},
      result: { completed: true },
    });
    expectCode(
      () =>
        withWorkspaceMutation(storage, KEY, request("different"), () => null),
      "operation_recovery_required",
    );
    expectCode(
      () =>
        withWorkspaceMutation(storage, "another-key", request(), () => null),
      "operation_nested_key_conflict",
    );
    return withWorkspaceMutation(storage, KEY, request(), (inner) => {
      assert.equal(inner, outer);
      return inner.complete({ completed: true });
    });
  });
  assert.deepEqual(result, { completed: true });
  assert.equal(taskLocks, 1);
  assert.equal(prepared, 1);
  assert.equal(readPendingWorkspaceOperation(storage, KEY), null);
});

test("Общая блокировка индекса освобождена до callback с удержанной task-блокировкой", (context) => {
  const { storage, root } = fixture(context);
  const fsUrl = new URL(
    "../src/filesystem/WorkspaceFs.adapter.mjs",
    import.meta.url,
  ).href;
  const lockUrl = new URL(
    "../src/filesystem/withWorkspaceFileLock.adapter.mjs",
    import.meta.url,
  ).href;
  withWorkspaceMutation(storage, KEY, request(), (mutation) => {
    const code = `import { WorkspaceFs } from ${JSON.stringify(fsUrl)}; import { acquireWorkspaceFileLock } from ${JSON.stringify(lockUrl)}; const storage=new WorkspaceFs(process.argv[1]); const release=acquireWorkspaceFileLock(storage,'recovery-index','recovery-index'); release(); storage.close();`;
    const child = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", code, root],
      { encoding: "utf8", timeout: 5000 },
    );
    assert.equal(child.status, 0, child.stderr);
    mutation.prepare({ localDossierId: OWNER, data: {}, result: 1 });
    return mutation.complete(1);
  });
});

test("Отказ после устойчивой записи prepared возвращает ссылку и оставляет pending", (context) => {
  const { storage } = fixture(context);
  const writeJson = storage.writeJson.bind(storage);
  storage.writeJson = (file, value, exclusive = false) => {
    writeJson(file, value, exclusive);
    if (file === workspaceOperationPaths(KEY).pending && exclusive)
      throw new Error("fixture after prepared");
  };
  assert.throws(
    () =>
      withWorkspaceMutation(storage, KEY, request(), (mutation) => {
        mutation.prepare({ localDossierId: OWNER, data: {}, result: 1 });
        return mutation.complete(1);
      }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.equal(
        /** @type {WorkspaceError} */ (error).operation?.operationId,
        "fixture-status",
      );
      return /fixture after prepared/.test(error.message);
    },
  );
  storage.writeJson = writeJson;
  assert.equal(readPendingWorkspaceOperation(storage, KEY)?.phase, "prepared");
  expectCode(
    () => withWorkspaceMutation(storage, KEY, request("foreign"), () => 2),
    "operation_recovery_required",
  );
});

test("Recovery после перезапуска завершает единственную запись перед cursor-save", (context) => {
  const { storage, root } = fixture(context);
  storage.write("dossier/TASK.md", "before-task");
  storage.write("dossier/artifact-manifest.json", "before-manifest");
  const writes = [
    planWorkspaceFile(
      storage,
      "dossier/artifact-manifest.json",
      "after-manifest",
    ),
    planWorkspaceFile(storage, "dossier/TASK.md", "after-task"),
  ];
  const write = storage.write.bind(storage);
  storage.write = (file, value, exclusive = false) => {
    write(file, value, exclusive);
    if (file === writes[0].path) throw new Error("fixture before cursor");
  };
  assert.throws(
    () =>
      withWorkspaceMutation(storage, KEY, request(), (mutation) => {
        mutation.prepare({
          localDossierId: OWNER,
          data: { writes },
          result: { revision: 2 },
        });
        commitWorkspaceMetadata(storage, mutation, writes);
        return mutation.complete({ revision: 2 });
      }),
    /fixture before cursor/,
  );
  storage.write = write;
  assert.equal(storage.read(writes[0].path).toString(), "after-manifest");
  assert.equal(storage.read(writes[1].path).toString(), "before-task");
  const fsUrl = new URL(
    "../src/filesystem/WorkspaceFs.adapter.mjs",
    import.meta.url,
  ).href;
  const recoverUrl = new URL(
    "../src/recovery/recoverWorkspaceOperation.service.mjs",
    import.meta.url,
  ).href;
  const metadataUrl = new URL(
    "../src/recovery/commitWorkspaceMetadata.service.mjs",
    import.meta.url,
  ).href;
  const code = `import { WorkspaceFs } from ${JSON.stringify(fsUrl)}; import { recoverWorkspaceOperation } from ${JSON.stringify(recoverUrl)}; import { resumeWorkspaceMetadataOperation } from ${JSON.stringify(metadataUrl)}; const storage=new WorkspaceFs(process.argv[1]); console.log(JSON.stringify(recoverWorkspaceOperation(storage,process.argv[2],process.argv[3],{status:resumeWorkspaceMetadataOperation}))); storage.close();`;
  const child = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", code, root, KEY, "fixture-status"],
    { encoding: "utf8", timeout: 10000 },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { revision: 2 });
  assert.equal(storage.read(writes[1].path).toString(), "after-task");
  assert.equal(readPendingWorkspaceOperation(storage, KEY), null);
});

test("Недостижимая смесь after второго файла и before первого отклоняется до записи", (context) => {
  const { storage } = fixture(context);
  storage.write("first", "before-first");
  storage.write("second", "before-second");
  const writes = [
    planWorkspaceFile(storage, "first", "after-first"),
    planWorkspaceFile(storage, "second", "after-second"),
  ];
  assert.throws(
    () =>
      withWorkspaceMutation(storage, KEY, request(), (mutation) => {
        mutation.prepare({
          localDossierId: OWNER,
          data: { writes },
          result: 2,
        });
        throw new Error("fixture prepared");
      }),
    /fixture prepared/,
  );
  storage.write("second", "after-second");
  expectCode(
    () =>
      recoverWorkspaceOperation(storage, KEY, "fixture-status", {
        status: resumeWorkspaceMetadataOperation,
      }),
    "metadata_state_conflict",
  );
  assert.equal(storage.read("first").toString(), "before-first");
});

test("Completed неизменяем, повтор не вызывает callback, хвост pending снимается после сверки", (context) => {
  const { storage } = fixture(context);
  const unlink = storage.unlink.bind(storage);
  storage.unlink = (file) => {
    if (file === workspaceOperationPaths(KEY).pending)
      throw new Error("fixture before unlink");
    return unlink(file);
  };
  assert.throws(
    () =>
      withWorkspaceMutation(storage, KEY, request(), (mutation) => {
        mutation.prepare({ localDossierId: OWNER, data: {}, result: 3 });
        return mutation.complete(3);
      }),
    /fixture before unlink/,
  );
  storage.unlink = unlink;
  const completedPath = /** @type {string} */ (
    workspaceOperationPaths(KEY, "fixture-status").completed
  );
  const before = storage.read(completedPath);
  assert.equal(
    withWorkspaceMutation(storage, KEY, request(), () => {
      throw new Error("must not execute");
    }),
    3,
  );
  assert.deepEqual(storage.read(completedPath), before);
  assert.equal(readPendingWorkspaceOperation(storage, KEY), null);
  expectCode(
    () =>
      withWorkspaceMutation(
        storage,
        KEY,
        { ...request(), input: { expectedRevision: 2 } },
        () => 4,
      ),
    "operation_identity_conflict",
  );
  expectCode(
    () =>
      withWorkspaceMutation(
        storage,
        KEY,
        {
          ...request(),
          checkCompletedIdentity() {
            throw new WorkspaceError("fixture_owner_changed");
          },
        },
        () => 4,
      ),
    "fixture_owner_changed",
  );
});

test("No-op guard проверяется без перезаписи, custom cursors сохраняются в одном журнале", (context) => {
  const { storage } = fixture(context);
  storage.write("guard", "unchanged");
  const writes = [
    planWorkspaceFile(storage, "guard", "unchanged"),
    planWorkspaceFile(storage, "created", "created"),
  ];
  const additional = [planWorkspaceFile(storage, "receipt", "receipt")];
  const before = storage.stat("guard");
  withWorkspaceMutation(storage, KEY, request(), (mutation) => {
    mutation.prepare({
      localDossierId: OWNER,
      data: { writes, receiptCursorWrites: additional },
      result: 4,
    });
    commitWorkspaceMetadata(storage, mutation, writes);
    commitWorkspaceMetadata(storage, mutation, additional, "receiptCursor");
    return mutation.complete(4);
  });
  assert.equal(storage.stat("guard").ino, before.ino);
  assert.equal(storage.stat("guard").mtimeNs, before.mtimeNs);
  const result = readCompletedWorkspaceOperation(
    storage,
    KEY,
    "fixture-status",
  );
  assert.equal(result?.data.metadataCursor, 2);
  assert.equal(result?.data.receiptCursor, 1);
});

test("Legacy index возобновляется порциями, ready lookup не обходит чужие журналы", (context) => {
  const { storage } = fixture(context);
  legacyCleanup(storage, KEY, "completed");
  const foreign = legacyCleanup(storage, "foreign-key", "completed");
  expectCode(
    () => ensureWorkspaceRecoveryIndex(storage, { batchSize: 1 }),
    "recovery_index_incomplete",
  );
  assert.equal(readWorkspaceRecoveryIndex(storage)?.cursor, 1);
  ensureWorkspaceRecoveryIndex(storage, { batchSize: 1 });
  assert.equal(readWorkspaceRecoveryIndex(storage)?.phase, "ready");
  storage.list = () => {
    throw new Error("ready must not list");
  };
  const json = storage.json.bind(storage);
  storage.json = (file, maxBytes) => {
    assert.notEqual(file, foreign.file);
    return json(file, maxBytes);
  };
  assert.equal(
    withWorkspaceMutation(storage, KEY, request(), (mutation) => {
      mutation.prepare({ localDossierId: OWNER, data: {}, result: 5 });
      return mutation.complete(5);
    }),
    5,
  );
});

test("Сохранённый absence guard запрещает все записи при появлении чужого пути", (context) => {
  const { storage } = fixture(context);
  storage.write("first", "before");
  const writes = [planWorkspaceFile(storage, "first", "after")];
  assert.throws(
    () =>
      withWorkspaceMutation(storage, KEY, request(), (mutation) => {
        mutation.prepare({
          localDossierId: OWNER,
          data: { writes, absentPaths: ["foreign/TASK.md"] },
          result: 6,
        });
        throw new Error("fixture before writes");
      }),
    /fixture before writes/,
  );
  storage.write("foreign/TASK.md", "foreign owner");
  const before = storage.read(workspaceOperationPaths(KEY).pending);
  expectCode(
    () =>
      recoverWorkspaceOperation(storage, KEY, "fixture-status", {
        status: resumeWorkspaceMetadataOperation,
      }),
    "metadata_state_conflict",
  );
  assert.equal(storage.read("first").toString(), "before");
  assert.equal(storage.read("foreign/TASK.md").toString(), "foreign owner");
  assert.deepEqual(storage.read(workspaceOperationPaths(KEY).pending), before);
  storage.unlink("foreign/TASK.md");
  assert.equal(
    recoverWorkspaceOperation(storage, KEY, "fixture-status", {
      status: resumeWorkspaceMetadataOperation,
    }),
    6,
  );
  assert.equal(storage.read("first").toString(), "after");
});

test("Legacy cleanup требует исходный план и сохраняет прежний формат без нового pending", (context) => {
  const { storage } = fixture(context);
  const legacy = legacyCleanup(storage, KEY);
  ensureWorkspaceRecoveryIndex(storage);
  expectCode(
    () => recoverWorkspaceOperation(storage, KEY, legacy.requestId, {}),
    "original_plan_required",
  );
  expectCode(
    () => withWorkspaceMutation(storage, KEY, request(), () => 0),
    "operation_recovery_required",
  );
  const planPath = "custom/original-plan.json";
  storage.writeJson(planPath, legacy.plan);
  const result = withWorkspaceMutation(
    storage,
    KEY,
    {
      kind: "cleanup",
      operationId: legacy.requestId,
      input: { planHash: legacy.plan.hash },
      legacy: {
        operationId: legacy.requestId,
        planPath,
        planHash: legacy.plan.hash,
        localDossierId: OWNER,
      },
    },
    (mutation) => {
      assert.equal(mutation.journal, null);
      assert.equal(mutation.legacy?.reference.planPath, planPath);
      assert.ok(mutation.legacy);
      mutation.legacy.journal.phase = "completed";
      mutation.legacy.journal.result = { status: "completed" };
      storage.writeJson(legacy.file, mutation.legacy.journal);
      return { status: "completed" };
    },
  );
  assert.deepEqual(result, { status: "completed" });
  assert.equal(storage.exists(workspaceOperationPaths(KEY).pending), false);
  assert.equal(
    inspectLegacyWorkspaceOperation(storage.json(legacy.file), legacy.file)
      .reference.completed,
    true,
  );
});

test("Pending и legacy одного ключа конфликтуют; неизвестная legacy phase не даёт ready", (context) => {
  const { storage } = fixture(context);
  const legacy = legacyCleanup(storage, KEY);
  ensureWorkspaceRecoveryIndex(storage);
  prepareWorkspaceOperation(storage, {
    schemaVersion: 1,
    key: KEY,
    operationId: "new-fixture",
    kind: "status",
    input: {},
    inputHash: canonicalHash({}),
    localDossierId: OWNER,
    phase: "prepared",
    data: {},
  });
  expectCode(
    () => withWorkspaceMutation(storage, KEY, request(), () => 0),
    "operation_conflict",
  );
  const broken = { ...legacy.journal, phase: "unknown" };
  expectCode(
    () => inspectLegacyWorkspaceOperation(broken, legacy.file),
    "legacy_operation_invalid",
  );
});

test("Повреждённый pending и неизвестная schema запрещают callback до эффектов", (context) => {
  const { storage } = fixture(context);
  ensureWorkspaceRecoveryIndex(storage);
  const valid = {
    schemaVersion: 1,
    key: KEY,
    operationId: "fixture-status",
    kind: "status",
    input: { expectedRevision: 1 },
    inputHash: canonicalHash({ expectedRevision: 1 }),
    localDossierId: OWNER,
    phase: "prepared",
    data: {},
  };
  const brokenValues = [
    null,
    {},
    { ...valid, schemaVersion: 2 },
    { ...valid, phase: "unexpected" },
    { ...valid, inputHash: "0".repeat(64) },
  ];
  for (const value of brokenValues) {
    storage.writeJson(workspaceOperationPaths(KEY).pending, value);
    expectCode(
      () =>
        withWorkspaceMutation(storage, KEY, request(), () => {
          throw new Error("callback must not execute");
        }),
      "operation_journal_invalid",
    );
    assert.deepEqual(storage.json(workspaceOperationPaths(KEY).pending), value);
  }
  storage.write(workspaceOperationPaths(KEY).pending, "{malformed");
  expectCode(
    () =>
      withWorkspaceMutation(storage, KEY, request(), () => {
        throw new Error("callback must not execute");
      }),
    "invalid_json",
  );
});

test("Повреждённый recovery index и конфликт двух legacy не разрешают мутацию", (context) => {
  const { storage } = fixture(context);
  const brokenValues = [
    null,
    { schemaVersion: 2, phase: "ready", files: [], cursor: 0 },
    { schemaVersion: 1, phase: "ready", files: ["valid.json"], cursor: 0 },
  ];
  for (const value of brokenValues) {
    storage.writeJson(WORKSPACE_RECOVERY_INDEX_PATH, value);
    expectCode(
      () =>
        withWorkspaceMutation(storage, KEY, request(), () => {
          throw new Error("callback must not execute");
        }),
      "recovery_index_invalid",
    );
    assert.deepEqual(storage.json(WORKSPACE_RECOVERY_INDEX_PATH), value);
  }
  storage.unlink(WORKSPACE_RECOVERY_INDEX_PATH);
  legacyCleanup(storage, KEY);
  legacyCleanup(storage, KEY);
  expectCode(
    () =>
      withWorkspaceMutation(storage, KEY, request(), () => {
        throw new Error("callback must not execute");
      }),
    "legacy_operation_conflict",
  );
  assert.equal(readWorkspaceRecoveryIndex(storage)?.phase, "building");
  assert.equal(readPendingWorkspaceOperation(storage, KEY), null);
});

test("Перезапуск после legacy-link до cursor-save продолжает index без повторных связей", (context) => {
  const { storage, root } = fixture(context);
  legacyCleanup(storage, KEY, "completed");
  legacyCleanup(storage, "other-key", "completed");
  const fsUrl = new URL(
    "../src/filesystem/WorkspaceFs.adapter.mjs",
    import.meta.url,
  ).href;
  const indexUrl = new URL(
    "../src/recovery/ensureWorkspaceRecoveryIndex.service.mjs",
    import.meta.url,
  ).href;
  const prefix = `import { WorkspaceFs } from ${JSON.stringify(fsUrl)}; import { ensureWorkspaceRecoveryIndex } from ${JSON.stringify(indexUrl)}; const storage=new WorkspaceFs(process.argv[1]);`;
  const crash = `${prefix} const writeJson=storage.writeJson.bind(storage); storage.writeJson=(file,value,exclusive=false)=>{if(file===${JSON.stringify(WORKSPACE_RECOVERY_INDEX_PATH)} && value.phase==='building' && value.cursor===1)process.exit(23); return writeJson(file,value,exclusive)}; ensureWorkspaceRecoveryIndex(storage,{batchSize:1});`;
  const interrupted = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", crash, root],
    { encoding: "utf8", timeout: 10000 },
  );
  assert.equal(interrupted.status, 23, interrupted.stderr);
  assert.equal(readWorkspaceRecoveryIndex(storage)?.cursor, 0);
  const indexedCount =
    readWorkspaceLegacyReferences(storage, KEY).length +
    readWorkspaceLegacyReferences(storage, "other-key").length;
  assert.equal(indexedCount, 1);
  const resumed = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `${prefix} ensureWorkspaceRecoveryIndex(storage); storage.close();`,
      root,
    ],
    { encoding: "utf8", timeout: 10000 },
  );
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(readWorkspaceRecoveryIndex(storage)?.phase, "ready");
  assert.equal(readWorkspaceLegacyReferences(storage, KEY).length, 1);
  assert.equal(readWorkspaceLegacyReferences(storage, "other-key").length, 1);
});
