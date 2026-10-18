/**
 * @file .ai/tools/task-workspace/test/producerRecovery.test.mjs
 * @version 1.0.1
 * @date 2026-10-15
 * @description Проверяет единый producer journal, восстановление прерываний и сохранение чужих bytes в изолированных fixtures.
 * @see documentation/specifications/task-management-execution.md
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { spawnSync } from "node:child_process";
import { WorkspaceFs } from "../src/filesystem/WorkspaceFs.adapter.mjs";
import { createDossier } from "../src/dossier/createDossier.service.mjs";
import { updateDossier } from "../src/dossier/updateDossier.service.mjs";
import {
  readDossier,
  readArtifacts,
  requireManaged,
} from "../src/dossier/Dossier.repository.mjs";
import {
  beginWorkspaceProducerGroup,
  finalizeWorkspaceProducerGroup,
} from "../src/producer-group/workspaceProducerGroup.index.mjs";
import { requireProducerGroup } from "../src/producer-group/WorkspaceProducerGroup.repository.mjs";
import { resumeWorkspaceProducerOperation } from "../src/producer-group/resumeWorkspaceProducerOperation.service.mjs";
import { recoverWorkspaceOperation } from "../src/recovery/recoverWorkspaceOperation.service.mjs";
import {
  readPendingWorkspaceOperation,
  workspaceOperationPaths,
} from "../src/recovery/WorkspaceOperation.repository.mjs";

/** @typedef {import("../src/producer-group/WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup} ProducerGroup */
/** @typedef {import("../src/producer-group/WorkspaceProducerGroup.types.ts").WorkspaceProducerGroupFinalization} Finalization */
/** @typedef {import("../src/recovery/WorkspaceOperation.types.ts").WorkspaceOperationReference} OperationReference */
/** @typedef {Omit<import("../src/recovery/WorkspaceOperation.types.ts").WorkspaceOperationJournal,"data"|"result"> & {data: import("../src/producer-group/WorkspaceProducerGroup.types.ts").WorkspaceProducerOperationData & {producer: import("../src/producer-group/WorkspaceProducerGroup.types.ts").WorkspaceProducerBeginOperation},result:ProducerGroup}} BeginJournal */
/** @typedef {Omit<import("../src/recovery/WorkspaceOperation.types.ts").WorkspaceOperationJournal,"data"> & {data: import("../src/producer-group/WorkspaceProducerGroup.types.ts").WorkspaceProducerOperationData & {cleanup: import("../src/cleanup/WorkspaceCleanup.types.ts").WorkspaceCleanupOperation,cleanupMetadataCursor?:number}}} FinalizeJournal */

const KEY = "producer-recovery";
const BASE = `.ai-workspace/tasks/${KEY}`;
/** @type {import("../src/producer-group/WorkspaceProducerGroup.types.ts").WorkspaceProducerGroupInput} */
const INPUT = { artifacts: [{ path: "tmp/run", category: "temporary" }] };
const FINALIZE = { quiescent: true, cleanupTemporary: true };
const handlers = {
  "producer-begin": resumeWorkspaceProducerOperation,
  "producer-finalize": resumeWorkspaceProducerOperation,
};

/** @param {import("node:test").TestContext} context */
function fixture(context) {
  const root = fs.mkdtempSync("/tmp/realize-producer-recovery-");
  const storage = new WorkspaceFs(root);
  context.after(() => {
    storage.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  createDossier(storage, { key: KEY, title: "Recovery", body: "# Fixture\n" });
  return { root, storage };
}
/** @param {WorkspaceFs} storage */
function manifest(storage) {
  return readArtifacts(storage, readDossier(storage, KEY));
}
/** @param {WorkspaceFs} storage */
function begin(storage) {
  return beginWorkspaceProducerGroup(storage, KEY, INPUT);
}
/** @param {WorkspaceFs} storage @param {string} operationId */
function recover(storage, operationId) {
  return recoverWorkspaceOperation(storage, KEY, operationId, handlers);
}
/** @param {WorkspaceFs} storage @param {ProducerGroup} group */
function finalize(storage, group) {
  return finalizeWorkspaceProducerGroup(storage, group, FINALIZE);
}
/** @param {WorkspaceFs} storage */
function output(storage) {
  storage.write(`${BASE}/tmp/run/generated.txt`, "producer bytes\n");
}
/** @param {() => unknown} operation @returns {NodeJS.ErrnoException & {operation:OperationReference}} */
function captureFailure(operation) {
  try {
    operation();
  } catch (error) {
    assert.ok(error instanceof Error && "operation" in error);
    return /** @type {NodeJS.ErrnoException & {operation:OperationReference}} */ (
      error
    );
  }
  assert.fail("Ожидалось прерывание");
}

/** @param {string} root @param {string} operationId @returns {unknown} */
function recoverInProcess(root, operationId) {
  const modules = {
    storage: new URL(
      "../src/filesystem/WorkspaceFs.adapter.mjs",
      import.meta.url,
    ).href,
    recovery: new URL(
      "../src/recovery/recoverWorkspaceOperation.service.mjs",
      import.meta.url,
    ).href,
    handler: new URL(
      "../src/producer-group/resumeWorkspaceProducerOperation.service.mjs",
      import.meta.url,
    ).href,
  };
  const script = `import {WorkspaceFs} from ${JSON.stringify(modules.storage)};
import {recoverWorkspaceOperation} from ${JSON.stringify(modules.recovery)};
import {resumeWorkspaceProducerOperation} from ${JSON.stringify(modules.handler)};
const storage = new WorkspaceFs(process.argv[1]);
try { process.stdout.write(JSON.stringify(recoverWorkspaceOperation(storage, ${JSON.stringify(KEY)}, process.argv[2], {"producer-begin":resumeWorkspaceProducerOperation,"producer-finalize":resumeWorkspaceProducerOperation}))); } finally {storage.close();}`;
  const child = spawnSync(
    process.execPath,
    [
      "--import=tsx/esm",
      "--input-type=module",
      "-e",
      script,
      root,
      operationId,
    ],
    { encoding: "utf8" },
  );
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

/** @param {Finalization} result @returns {Finalization & {operation:OperationReference}} */
function expectBlocked(result) {
  assert.equal(result.status, "blocked");
  assert.ok(result.operation);
  return /** @type {Finalization & {operation:OperationReference}} */ (result);
}
/** @param {WorkspaceFs} storage @returns {FinalizeJournal} */
function pendingFinalize(storage) {
  const pending = readPendingWorkspaceOperation(storage, KEY);
  assert.ok(pending);
  assert.equal(pending.kind, "producer-finalize");
  return /** @type {FinalizeJournal} */ (pending);
}

test("Begin сохраняет полный prepared до mkdir и восстанавливает partial metadata в новом процессе без handle", (context) => {
  const { root, storage } = fixture(context);
  const writeJson = storage.writeJson.bind(storage),
    write = storage.write.bind(storage);
  /** @type {BeginJournal | undefined} */
  let original;
  storage.writeJson = (file, value, ...rest) => {
    const data = /** @type {BeginJournal} */ (value);
    if (
      file === workspaceOperationPaths(KEY).pending &&
      data.kind === "producer-begin" &&
      !original
    ) {
      original = structuredClone(data);
      assert.equal(storage.exists(`${BASE}/tmp`), false);
      assert.deepEqual(manifest(storage).artifacts, []);
      assert.equal(data.data.producerMetadataCursorWrites.length, 2);
      assert.ok(
        data.data.producer.directories.every(
          (entry) => entry.state === "pending",
        ),
      );
    }
    return writeJson(file, data, ...rest);
  };
  storage.write = (file, ...rest) => {
    if (file === `${BASE}/TASK.md`) throw new Error("stop after manifest");
    return write(file, ...rest);
  };
  const error = captureFailure(() => begin(storage));
  storage.write = write;
  storage.writeJson = writeJson;
  assert.equal(error.message, "stop after manifest");
  assert.ok(original);
  assert.equal(error.operation.operationId, original.operationId);
  assert.equal(manifest(storage).artifacts.length, 1);
  const summary = /** @type {ProducerGroup} */ (
    recoverInProcess(root, original.operationId)
  );
  assert.deepEqual(summary.artifactIds, original.result.artifactIds);
  assert.equal(requireManaged(readDossier(storage, KEY)).revision, 2);
  assert.equal(readPendingWorkspaceOperation(storage, KEY), null);
  const unbound = finalize(storage, summary);
  assert.equal(unbound.status, "blocked");
  assert.equal(unbound.reason, "producer_group_unbound");
  assert.deepEqual(recover(storage, original.operationId), summary);
});

test("Mkdir без durable inode остаётся unknown и не присваивает чужой каталог", (context) => {
  const { storage } = fixture(context);
  const writeJson = storage.writeJson.bind(storage);
  storage.writeJson = (file, value, ...rest) => {
    const data = /** @type {BeginJournal} */ (value);
    if (
      file === workspaceOperationPaths(KEY).pending &&
      data.kind === "producer-begin" &&
      data.data.producer.directories.some((entry) => entry.state === "created")
    )
      throw new Error("stop before inode save");
    return writeJson(file, data, ...rest);
  };
  const error = captureFailure(() => begin(storage));
  storage.writeJson = writeJson;
  storage.write(`${BASE}/tmp/foreign.txt`, "foreign bytes\n");
  assert.throws(() => recover(storage, error.operation.operationId), {
    code: "producer_directory_outcome_unknown",
  });
  assert.equal(
    storage.read(`${BASE}/tmp/foreign.txt`).toString(),
    "foreign bytes\n",
  );
  assert.deepEqual(manifest(storage).artifacts, []);
});

test("Recovery begin отвергает непустой корень до metadata и сохраняет bytes writer", (context) => {
  const { storage } = fixture(context);
  const writeJson = storage.writeJson.bind(storage);
  let injected = false;
  storage.writeJson = (file, value, ...rest) => {
    const data = /** @type {BeginJournal} */ (value);
    const result = writeJson(file, data, ...rest);
    if (
      !injected &&
      data?.data?.producer?.directories?.some(
        (entry) =>
          entry.path === `${BASE}/tmp/run` && entry.state === "created",
      )
    ) {
      injected = true;
      output(storage);
    }
    return result;
  };
  const error = captureFailure(() => begin(storage));
  storage.writeJson = writeJson;
  assert.equal(error.code, "producer_directory_changed");
  assert.throws(() => recover(storage, error.operation.operationId), {
    code: "producer_directory_changed",
  });
  assert.equal(
    storage.read(`${BASE}/tmp/run/generated.txt`).toString(),
    "producer bytes\n",
  );
  assert.deepEqual(manifest(storage).artifacts, []);
});

test("Finalize повторяет исходный plan после settle под одним pending и блокирует постороннюю mutation", (context) => {
  const { storage } = fixture(context),
    group = begin(storage);
  output(storage);
  const write = storage.write.bind(storage);
  storage.write = (file, ...rest) => {
    if (file.startsWith(`${BASE}/logs/cleanup-plans/`))
      throw new Error("stop before plan");
    return write(file, ...rest);
  };
  const blocked = expectBlocked(finalize(storage, group));
  storage.write = write;
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.operation.kind, "producer-finalize");
  const pending = pendingFinalize(storage);
  assert.equal(pending.data.producerMetadataCursor, 2);
  assert.equal(pending.data.cleanup.planPath, blocked.cleanup.planPath);
  assert.equal(pending.data.cleanup.requestId, pending.operationId);
  assert.equal(manifest(storage).artifacts[0].producer.settled, true);
  assert.throws(() => updateDossier(storage, KEY, 3, { category: "active" }), {
    code: "operation_recovery_required",
  });
  const completed = finalize(storage, group);
  assert.equal(completed.status, "completed");
  assert.equal(completed.cleanup.status, "completed");
  assert.equal(completed.cleanup.receipt.requestId, pending.operationId);
  assert.deepEqual(storage.list(`${BASE}/logs/cleanup-plans`), [
    `${pending.operationId}.json`,
  ]);
  assert.equal(requireManaged(readDossier(storage, KEY)).revision, 4);
  assert.equal(storage.exists(`${BASE}/tmp/run`), false);
  assert.deepEqual(finalize(storage, group), completed);
  assert.equal(readPendingWorkspaceOperation(storage, KEY), null);
});

test("Finalize recovery в новом процессе дописывает original receipt после purge без нового plan", (context) => {
  const { root, storage } = fixture(context),
    group = begin(storage);
  output(storage);
  storage.write(`${BASE}/tmp/foreign/sentinel.txt`, "foreign bytes\n");
  const write = storage.write.bind(storage);
  storage.write = (file, ...rest) => {
    if (file.startsWith(`${BASE}/logs/cleanup-results/`))
      throw new Error("stop before receipt");
    return write(file, ...rest);
  };
  const blocked = expectBlocked(finalize(storage, group));
  storage.write = write;
  const pending = pendingFinalize(storage);
  assert.equal(blocked.status, "blocked");
  assert.equal(storage.exists(`${BASE}/tmp/run`), false);
  assert.equal(pending.data.cleanupMetadataCursor, 2);
  const completed = /** @type {Finalization} */ (
    recoverInProcess(root, pending.operationId)
  );
  assert.equal(completed.cleanup.status, "completed");
  assert.deepEqual(completed.cleanup.receipt, pending.data.cleanup.result);
  assert.equal(completed.cleanup.planPath, pending.data.cleanup.planPath);
  assert.equal(
    storage.read(`${BASE}/tmp/foreign/sentinel.txt`).toString(),
    "foreign bytes\n",
  );
  assert.deepEqual(finalize(storage, group), completed);
  assert.equal(requireManaged(readDossier(storage, KEY)).revision, 4);
});

test("Finalize recovery не переснимает изменённые после prepared outputs", (context) => {
  const { storage } = fixture(context),
    group = begin(storage);
  output(storage);
  const write = storage.write.bind(storage);
  storage.write = (file, ...rest) => {
    if (file === `${BASE}/artifact-manifest.json`)
      throw new Error("stop before settle");
    return write(file, ...rest);
  };
  const blocked = expectBlocked(finalize(storage, group));
  storage.write = write;
  storage.write(`${BASE}/tmp/run/generated.txt`, "changed after prepared\n");
  assert.throws(() => recover(storage, blocked.operation.operationId), {
    code: "artifact_changed",
  });
  assert.equal(manifest(storage).artifacts[0].producer.settled, false);
  assert.equal(
    storage.read(`${BASE}/tmp/run/generated.txt`).toString(),
    "changed after prepared\n",
  );
});

test("Подмена исходного plan сохраняет trees и operation reference при повторе finalize", (context) => {
  const { storage } = fixture(context),
    group = begin(storage);
  output(storage);
  const rename = storage.renameNoReplace.bind(storage);
  storage.renameNoReplace = () => {
    throw new Error("stop before rename");
  };
  const blocked = expectBlocked(finalize(storage, group));
  storage.renameNoReplace = rename;
  assert.ok(blocked.cleanup.planPath);
  const original = storage.read(blocked.cleanup.planPath).toString();
  storage.write(
    blocked.cleanup.planPath,
    original.replace('"schemaVersion": 1', '"schemaVersion": 2'),
  );
  const repeated = expectBlocked(finalize(storage, group));
  assert.equal(repeated.reason, "cleanup_plan_invalid");
  assert.equal(repeated.operation.operationId, blocked.operation.operationId);
  assert.equal(
    storage.read(`${BASE}/tmp/run/generated.txt`).toString(),
    "producer bytes\n",
  );
  assert.equal(storage.list(`${BASE}/logs/cleanup-plans`).length, 1);
});

test("Completed finalize привязан к исходному localDossierId", (context) => {
  const { storage } = fixture(context),
    group = begin(storage);
  output(storage);
  assert.equal(finalize(storage, group).status, "completed");
  const task = storage.read(`${BASE}/TASK.md`).toString();
  storage.write(
    `${BASE}/TASK.md`,
    task.replace(group.localDossierId, "00000000-0000-4000-8000-000000000001"),
  );
  const changedOwner = finalize(storage, group);
  assert.equal(changedOwner.status, "blocked");
  assert.equal(changedOwner.reason, "dossier_identity_mismatch");
  assert.equal(readPendingWorkspaceOperation(storage, KEY), null);
});

test("Producer recovery отвергает чужой metadata path до создания каталогов", (context) => {
  const { storage } = fixture(context);
  const writeJson = storage.writeJson.bind(storage);
  storage.writeJson = (file, value, ...rest) => {
    const result = writeJson(file, value, ...rest);
    if (file === workspaceOperationPaths(KEY).pending)
      throw new Error("stop after prepared");
    return result;
  };
  const error = captureFailure(() => begin(storage));
  storage.writeJson = writeJson;
  assert.equal(storage.exists(`${BASE}/tmp`), false);
  storage.write("src/foreign.txt", "foreign metadata bytes\n");
  const pending = readPendingWorkspaceOperation(storage, KEY);
  assert.ok(pending);
  const data = /** @type {BeginJournal["data"]} */ (pending.data);
  data.producerMetadataCursorWrites[0].path = "src/foreign.txt";
  storage.writeJson(workspaceOperationPaths(KEY).pending, pending);
  assert.throws(() => recover(storage, error.operation.operationId), {
    code: "producer_operation_invalid",
  });
  assert.equal(storage.exists(`${BASE}/tmp`), false);
  assert.equal(
    storage.read("src/foreign.txt").toString(),
    "foreign metadata bytes\n",
  );
});

test("V10: partial settle после неудачного save определяется по readback и повторяется до binding check", (context) => {
  const { storage } = fixture(context),
    group = begin(storage);
  output(storage);
  const writeJson = storage.writeJson.bind(storage);
  let failed = false;
  storage.writeJson = (file, value, ...rest) => {
    const journal = /** @type {FinalizeJournal} */ (value);
    if (
      !failed &&
      file === workspaceOperationPaths(KEY).pending &&
      journal.kind === "producer-finalize" &&
      journal.data.producerMetadataCursor === 1
    ) {
      failed = true;
      throw new Error("stop before durable cursor");
    }
    return writeJson(file, value, ...rest);
  };
  const blocked = expectBlocked(finalize(storage, group));
  storage.writeJson = writeJson;
  assert.equal(blocked.settlement, "partial");
  assert.equal(blocked.phase, "settlement");
  assert.equal(pendingFinalize(storage).data.producerMetadataCursor, undefined);
  assert.equal(requireManaged(readDossier(storage, KEY)).revision, 2);
  assert.equal(manifest(storage).artifacts[0].producer.settled, true);
  const result = finalize(storage, group);
  assert.equal(result.status, "completed");
  assert.equal(result.settlement, "settled");
  assert.equal(result.cleanup.status, "completed");
  assert.equal(result.cleanup.receipt.requestId, blocked.operation.operationId);
});

test("V10: неизвестный durable metadata prefix не объявляется settled по in-memory cursor", async (context) => {
  for (const corruption of ["foreign body", "invalid UTF-8"])
    await context.test(corruption, (child) => {
      const { storage } = fixture(child);
      const task = `${BASE}/TASK.md`;
      storage.write(
        task,
        storage.read(task).toString() + "replacement: \uFFFD\n",
      );
      const group = begin(storage);
      output(storage);
      const writeJson = storage.writeJson.bind(storage);
      let failed = false;
      storage.writeJson = (file, value, ...rest) => {
        const journal = /** @type {FinalizeJournal} */ (value);
        if (
          !failed &&
          file === workspaceOperationPaths(KEY).pending &&
          journal.kind === "producer-finalize" &&
          journal.data.producerMetadataCursor === 2
        ) {
          failed = true;
          const bytes = storage.read(task);
          if (corruption === "foreign body")
            storage.write(task, bytes.toString() + "foreign body\n");
          else {
            const offset = bytes.indexOf(Buffer.from("\uFFFD"));
            assert.ok(offset >= 0);
            storage.write(
              task,
              Buffer.concat([
                bytes.subarray(0, offset),
                Buffer.from([0xff]),
                bytes.subarray(offset + 3),
              ]),
            );
          }
          throw new Error("stop before cursor save with foreign TASK");
        }
        return writeJson(file, value, ...rest);
      };
      const blocked = expectBlocked(finalize(storage, group));
      storage.writeJson = writeJson;
      assert.equal(blocked.settlement, "unknown");
      assert.equal(blocked.phase, "unknown");
      const bytes = storage.read(task);
      const repeated = expectBlocked(finalize(storage, group));
      assert.equal(repeated.settlement, "unknown");
      assert.deepEqual(storage.read(task), bytes);
      assert.equal(
        storage.read(`${BASE}/tmp/run/generated.txt`).toString(),
        "producer bytes\n",
      );
    });
});

test("V10: повреждённый owner-plan отвергается до записи metadata и удаления", async (context) => {
  for (const corruption of [
    "manifest owner",
    "TASK body",
    "empty artifacts",
    "unsettled artifacts",
    "unknown phase",
  ])
    await context.test(corruption, (child) => {
      const { storage } = fixture(child),
        group = begin(storage);
      output(storage);
      const write = storage.write.bind(storage);
      storage.write = (file, ...rest) => {
        if (file === `${BASE}/artifact-manifest.json`)
          throw new Error("stop before settlement");
        return write(file, ...rest);
      };
      const blocked = expectBlocked(finalize(storage, group));
      storage.write = write;
      const pending = pendingFinalize(storage);
      const original = structuredClone(pending);
      const state = pending.data.producer;
      const writes = pending.data.producerMetadataCursorWrites;
      if (corruption === "manifest owner") {
        const data = JSON.parse(writes[0].after);
        data.localDossierId = "00000000-0000-4000-8000-000000000001";
        writes[0].after = JSON.stringify(data, null, 2) + "\n";
      }
      if (corruption === "TASK body") writes[1].after += "foreign body\n";
      if (corruption === "empty artifacts") state.artifacts = [];
      if (corruption === "unsettled artifacts")
        state.artifacts[0].producer.settled = false;
      if (corruption === "unknown phase")
        Object.assign(state, { phase: "invented" });
      storage.writeJson(workspaceOperationPaths(KEY).pending, pending);
      const before = [`${BASE}/artifact-manifest.json`, `${BASE}/TASK.md`].map(
        (file) => storage.read(file),
      );
      let writeCount = 0;
      storage.write = (file, ...rest) => {
        writeCount++;
        return write(file, ...rest);
      };
      const repeated = expectBlocked(finalize(storage, group));
      assert.equal(repeated.settlement, "unknown");
      assert.equal(repeated.phase, "unknown");
      assert.equal(
        repeated.operation.operationId,
        blocked.operation.operationId,
      );
      assert.equal(writeCount, 0);
      assert.deepEqual(
        [`${BASE}/artifact-manifest.json`, `${BASE}/TASK.md`].map((file) =>
          storage.read(file),
        ),
        before,
      );
      assert.equal(
        storage.read(`${BASE}/tmp/run/generated.txt`).toString(),
        "producer bytes\n",
      );
      storage.write = write;
      storage.writeJson(workspaceOperationPaths(KEY).pending, original);
      assert.equal(finalize(storage, group).status, "completed");
    });
});

test("V11: TS union требует receipt completed и reason blocked без неявного any", (context) => {
  const root = fs.mkdtempSync("/tmp/realize-producer-contract-");
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const types = path.resolve(
    ".ai/tools/task-workspace/src/producer-group/WorkspaceProducerGroup.types.ts",
  );
  const api = path.resolve(
    ".ai/tools/task-workspace/src/producer-group/workspaceProducerGroup.index.mjs",
  );
  const imports = `import type {WorkspaceProducerGroupFinalization as Result, WorkspaceProducerFinalizationCompleted as Completed, WorkspaceProducerFinalizationBlocked as Blocked} from ${JSON.stringify(types)};
import {finalizeWorkspaceProducerGroup} from ${JSON.stringify(api)};
`;
  const positive = path.join(root, "positive.ts"),
    negative = path.join(root, "negative.ts");
  fs.writeFileSync(
    positive,
    imports +
      `
type IsAny<T> = 0 extends (1 & T) ? true : false;
const typed: false = null as unknown as IsAny<ReturnType<typeof finalizeWorkspaceProducerGroup>>;
declare const result: Result;
if (result.status === "blocked") { const reason: string = result.reason; const phase: string = result.phase; }
if (result.cleanup.status === "completed") { const requestId: string = result.cleanup.receipt.requestId; }
`,
  );
  fs.writeFileSync(
    negative,
    imports +
      `
const missingReceipt: Completed = {status:"completed",settlement:"settled",phase:"completed",operation:null,artifactIds:[],cleanup:{status:"completed",paths:[],planPath:"logs/plan.json"}};
const missingReason: Blocked = {status:"blocked",settlement:"unknown",phase:"unknown",operation:null,artifactIds:[],cleanup:{status:"blocked",reason:"blocked",paths:[],planPath:null}};
declare const result: Result;
if (result.cleanup.status === "blocked") result.cleanup.receipt;
`,
  );
  const config = ts.readConfigFile(
    ".ai/tools/task-workspace/tsconfig.json",
    ts.sys.readFile,
  );
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    process.cwd(),
  );
  const program = ts.createProgram([positive, negative], {
    ...parsed.options,
    checkJs: false,
    typeRoots: [path.resolve("node_modules/@types")],
  });
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter(
      (diagnostic) =>
        diagnostic.file &&
        [positive, negative].includes(diagnostic.file.fileName),
    );
  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.file?.fileName === positive),
    [],
  );
  const failures = diagnostics.filter(
    (diagnostic) => diagnostic.file?.fileName === negative,
  );
  assert.equal(
    failures.length,
    3,
    ts.formatDiagnostics(failures, {
      getCurrentDirectory: () => process.cwd(),
      getCanonicalFileName: (name) => name,
      getNewLine: () => "\n",
    }),
  );
  assert.deepEqual(
    failures.map((diagnostic) => diagnostic.code).sort(),
    [2322, 2339, 2741],
  );
});

test("V10: manifest больше 1 MiB подтверждает собственный settlement и completed replay", (context) => {
  const { storage } = fixture(context),
    group = begin(storage);
  output(storage);
  const data = manifest(storage);
  const foreign = Array.from({ length: 1023 }, (_, index) => ({
    ...structuredClone(data.artifacts[0]),
    id: randomUUID(),
    path: `logs/foreign-${index}/${Array.from({ length: 5 }, () => "x".repeat(180)).join("/")}`,
    state: /** @type {const} */ ("deleted"),
    producer: {
      id: "foreign-capacity",
      pid: null,
      identity: null,
      settled: true,
    },
  }));
  data.artifacts.push(...foreign);
  data.revision++;
  const text = JSON.stringify(data, null, 2) + "\n";
  assert.ok(Buffer.byteLength(text) > 1024 * 1024);
  storage.write(`${BASE}/artifact-manifest.json`, text);
  const input = { quiescent: true, cleanupTemporary: false };
  const result = finalizeWorkspaceProducerGroup(storage, group, input);
  assert.equal(result.status, "completed");
  assert.equal(result.settlement, "settled");
  const confirmed = requireProducerGroup(storage, group);
  assert.equal(confirmed.artifacts[0].producer.settled, true);
  assert.deepEqual(
    confirmed.manifest.artifacts.filter(
      (artifact) => !group.artifactIds.includes(artifact.id),
    ),
    foreign,
  );
  assert.deepEqual(
    finalizeWorkspaceProducerGroup(storage, group, input),
    result,
  );
  assert.equal(readPendingWorkspaceOperation(storage, KEY), null);
});
