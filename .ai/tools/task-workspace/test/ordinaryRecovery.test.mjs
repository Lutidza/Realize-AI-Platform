/**
 * @file .ai/tools/task-workspace/test/ordinaryRecovery.test.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Проверяет prepared, точные metadata и replay обычных мутаций только на временных досье.
 * @see documentation/specifications/task-management-execution.md
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { WorkspaceFs } from "../src/filesystem/WorkspaceFs.adapter.mjs";
import { createDossier } from "../src/dossier/createDossier.service.mjs";
import { updateDossier } from "../src/dossier/updateDossier.service.mjs";
import {
  readDossier,
  readArtifacts,
  serializeDossier,
  requireManaged,
} from "../src/dossier/Dossier.repository.mjs";
import { registerWorkspaceArtifacts } from "../src/artifacts/registerWorkspaceArtifacts.service.mjs";
import { settleWorkspaceArtifacts } from "../src/artifacts/settleWorkspaceArtifacts.service.mjs";
import { publishWorkspaceResult } from "../src/artifacts/publishWorkspaceResult.service.mjs";
import { planWorkspaceCleanup } from "../src/cleanup/planWorkspaceCleanup.service.mjs";
import { prepareWorkspaceRegistration } from "../src/artifacts/prepareWorkspaceRegistration.service.mjs";
import { prepareWorkspaceSettlement } from "../src/artifacts/prepareWorkspaceSettlement.service.mjs";
import { prepareWorkspaceCleanupPlan } from "../src/cleanup/prepareWorkspaceCleanupPlan.service.mjs";
import {
  workspaceOperationPaths,
  readPendingWorkspaceOperation,
} from "../src/recovery/WorkspaceOperation.repository.mjs";
import { WorkspaceError } from "../src/Workspace.error.mjs";
import { recoverWorkspaceOperation } from "../src/recovery/recoverWorkspaceOperation.service.mjs";
import { resumeWorkspaceMetadataOperation } from "../src/recovery/commitWorkspaceMetadata.service.mjs";

const KEY = "ordinary-recovery";
const BASE = `.ai-workspace/tasks/${KEY}`;
const BODY = "# Изолированная задача\n\nКритерий: сохранить точные bytes.\n";
const ORIGINAL = { key: KEY, title: "Recovery fixture", body: BODY };

/** Каждый runtime и TASK привязан к своему /tmp root; реальный workspace не используется.
 * @param {import("node:test").TestContext} context
 */
function fixture(context) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "realize-ordinary-recovery-"),
  );
  const storage = new WorkspaceFs(root);
  context.after(() => {
    storage.close();
    assert.ok(
      root.startsWith(path.join(os.tmpdir(), "realize-ordinary-recovery-")),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
  return storage;
}

/** @param {boolean} [settled] @returns {import("../src/artifacts/WorkspaceArtifacts.types").WorkspaceArtifactRegistration} */
function item(settled = true) {
  return {
    path: "tmp/work",
    category: "temporary",
    producer: { id: "fixture", pid: null, settled },
    retention: {
      mode: "temporary",
      pinned: false,
      keepReason: null,
      referencedBy: [],
    },
  };
}

/** @param {WorkspaceFs} storage */
function seed(storage) {
  createDossier(storage, ORIGINAL, false, { operationId: "seed-create" });
}

/** @param {WorkspaceFs} storage @param {boolean} settled */
function seedArtifact(storage, settled) {
  storage.write(`${BASE}/tmp/work/output.txt`, "isolated artifact\n");
  registerWorkspaceArtifacts(
    storage,
    KEY,
    requireManaged(readDossier(storage, KEY)).revision,
    { artifacts: [item(settled)] },
    { operationId: "seed-register" },
  );
}

/** @param {WorkspaceFs} storage @returns {import("./OrdinaryRecovery.types").OrdinaryRecoveryJournal} */
function readPrepared(storage) {
  const journal = readPendingWorkspaceOperation(storage, KEY);
  assert.ok(journal);
  assert.ok(Array.isArray(journal.data.writes));
  return /** @type {import("./OrdinaryRecovery.types").OrdinaryRecoveryJournal} */ (
    journal
  );
}

/** @param {unknown} error @param {string} code @param {string} [operationId] */
function hasCode(error, code, operationId) {
  if (!(error instanceof WorkspaceError) || error.code !== code) return false;
  if (!operationId) return true;
  return (
    "operation" in error &&
    typeof error.operation === "object" &&
    error.operation !== null &&
    "operationId" in error.operation &&
    error.operation.operationId === operationId
  );
}

/** Инъекция останавливает owner до/после конкретного эффекта, проверяя полный prepared до него.
 * @param {WorkspaceFs} storage @param {number} step @param {boolean} after
 */
function interruptWrite(storage, step, after) {
  const original = storage.write.bind(storage);
  let effects = 0;
  /** @type {import("./OrdinaryRecovery.types").OrdinaryRecoveryJournal | undefined} */
  let prepared;
  storage.write = (file, bytes, exclusive) => {
    if (file.startsWith(`${BASE}/`)) {
      effects++;
      prepared = readPrepared(storage);
      assert.equal(prepared.phase, "prepared");
      assert.ok(prepared.data.writes.length > 0);
      const planned = prepared.data.writes.find((write) => write.path === file);
      assert.ok(planned, `Эффект отсутствует в prepared: ${file}`);
      assert.equal(Buffer.from(bytes).toString("utf8"), planned.after);
      if (effects === step && !after) throw new Error("fixture-interrupted");
      original(file, bytes, exclusive);
      if (effects === step && after) throw new Error("fixture-interrupted");
      return;
    }
    return original(file, bytes, exclusive);
  };
  return {
    restore: () => {
      storage.write = original;
    },
    prepared: () => prepared,
  };
}

/** @type {import("./OrdinaryRecovery.types").OrdinaryRecoveryScenario[]} */
const operations = [
  {
    name: "create",
    effects: 2,
    setup() {},
    invoke(storage, options, changed) {
      return createDossier(
        storage,
        { ...ORIGINAL, title: changed ? "Changed" : ORIGINAL.title },
        false,
        options,
      );
    },
  },
  {
    name: "adopt",
    effects: 2,
    setup(storage) {
      storage.write(`${BASE}/TASK.md`, BODY);
    },
    invoke(storage, options, changed) {
      return createDossier(
        storage,
        { ...ORIGINAL, category: changed ? "active" : "open" },
        true,
        options,
      );
    },
  },
  {
    name: "status",
    effects: 1,
    setup: seed,
    invoke(storage, options, changed) {
      return updateDossier(
        storage,
        KEY,
        1,
        { category: changed ? "waiting" : "active" },
        options,
      );
    },
  },
  {
    name: "register",
    effects: 2,
    setup(storage) {
      seed(storage);
      storage.write(`${BASE}/tmp/work/output.txt`, "isolated artifact\n");
    },
    invoke(storage, options, changed) {
      return registerWorkspaceArtifacts(
        storage,
        KEY,
        1,
        { artifacts: [item(!changed)] },
        options,
      );
    },
  },
  {
    name: "settle",
    effects: 2,
    setup(storage) {
      seed(storage);
      seedArtifact(storage, false);
      this.artifactId = readArtifacts(
        storage,
        readDossier(storage, KEY),
      ).artifacts[0].id;
    },
    invoke(storage, options, changed) {
      assert.ok(this.artifactId);
      return settleWorkspaceArtifacts(
        storage,
        KEY,
        changed ? 3 : 2,
        { artifactIds: [this.artifactId] },
        options,
      );
    },
  },
  {
    name: "result",
    effects: 3,
    setup: seed,
    invoke(storage, options, changed) {
      return publishWorkspaceResult(
        storage,
        KEY,
        1,
        {
          summary: changed ? "Changed result" : "Exact result",
          artifacts: [],
          checks: [],
        },
        options,
      );
    },
  },
  {
    name: "plan-cleanup",
    effects: 1,
    setup(storage) {
      seed(storage);
      seedArtifact(storage, true);
    },
    invoke(storage, options, changed) {
      return planWorkspaceCleanup(
        storage,
        KEY,
        2,
        changed ? [] : undefined,
        undefined,
        options,
      );
    },
  },
];

for (const operation of operations) {
  test(`P04 ${operation.name}: все durable prefixes восстанавливают один исходный результат`, async (context) => {
    for (const after of [false, true]) {
      for (let step = 1; step <= operation.effects; step++) {
        await context.test(
          `${after ? "после" : "до"} записи ${step}`,
          (subcontext) => {
            const storage = fixture(subcontext);
            operation.setup(storage);
            const options = { operationId: `interrupted-${operation.name}` };
            const fault = interruptWrite(storage, step, after);
            assert.throws(
              () => operation.invoke(storage, options),
              /fixture-interrupted/,
            );
            fault.restore();
            const prepared = fault.prepared();
            assert.ok(prepared);
            assert.equal(prepared.kind, operation.name);
            const expected = prepared.data.result;
            const result = operation.invoke(storage, options);
            assert.deepEqual(result, expected);
            assert.equal(
              storage.exists(workspaceOperationPaths(KEY).pending),
              false,
            );
            for (const write of prepared.data.writes)
              assert.equal(
                storage.read(write.path, 32 * 1024 * 1024).toString("utf8"),
                write.after,
              );
            if (operation.name === "adopt")
              assert.equal(readDossier(storage, KEY).body, BODY);
            const completedPath = workspaceOperationPaths(
              KEY,
              options.operationId,
            ).completed;
            assert.ok(completedPath);
            const completed = storage.read(completedPath, 64 * 1024 * 1024);
            let replayEffects = 0;
            const original = storage.write.bind(storage);
            storage.write = (file, bytes, exclusive) => {
              if (file.startsWith(`${BASE}/`)) replayEffects++;
              return original(file, bytes, exclusive);
            };
            assert.deepEqual(operation.invoke(storage, options), expected);
            assert.equal(replayEffects, 0);
            assert.deepEqual(
              storage.read(completedPath, 64 * 1024 * 1024),
              completed,
            );
            assert.throws(
              () => operation.invoke(storage, options, true),
              (error) => hasCode(error, "operation_identity_conflict"),
            );
            assert.equal(replayEffects, 0);
          },
        );
      }
    }
  });
}

test("P04: pending блокирует каждую чужую обычную мутацию до изменения revision или плана", (context) => {
  const storage = fixture(context);
  seed(storage);
  const fault = interruptWrite(storage, 1, false);
  assert.throws(
    () =>
      updateDossier(
        storage,
        KEY,
        1,
        { category: "active" },
        { operationId: "pending-status" },
      ),
    /fixture-interrupted/,
  );
  fault.restore();
  const before = storage.read(`${BASE}/TASK.md`);
  const pending = storage.read(
    workspaceOperationPaths(KEY).pending,
    64 * 1024 * 1024,
  );
  const calls = [
    () => createDossier(storage, ORIGINAL),
    () => createDossier(storage, { ...ORIGINAL, category: "open" }, true),
    () => updateDossier(storage, KEY, 1, { category: "active" }),
    () => registerWorkspaceArtifacts(storage, KEY, 1, { artifacts: [item()] }),
    () =>
      settleWorkspaceArtifacts(storage, KEY, 1, { artifactIds: ["unknown"] }),
    () =>
      publishWorkspaceResult(storage, KEY, 1, {
        summary: "Blocked",
        artifacts: [],
        checks: [],
      }),
    () => planWorkspaceCleanup(storage, KEY, 1),
  ];
  for (const call of calls)
    assert.throws(call, (error) =>
      hasCode(error, "operation_recovery_required", "pending-status"),
    );
  assert.deepEqual(storage.read(`${BASE}/TASK.md`), before);
  assert.deepEqual(
    storage.read(workspaceOperationPaths(KEY).pending, 64 * 1024 * 1024),
    pending,
  );
});

test("P04: произвольная смесь metadata и изменение no-op guard отклоняются без дополнительных эффектов", async (context) => {
  for (const guard of [false, true])
    await context.test(
      guard ? "TASK guard plan" : "manifest/TASK смесь",
      (subcontext) => {
        const storage = fixture(subcontext);
        seed(storage);
        seedArtifact(storage, true);
        const invoke = guard
          ? () =>
              planWorkspaceCleanup(storage, KEY, 2, undefined, undefined, {
                operationId: "guard-plan",
              })
          : () =>
              registerWorkspaceArtifacts(
                storage,
                KEY,
                2,
                { artifacts: [{ ...item(), path: "tmp/other" }] },
                { operationId: "mixed-register" },
              );
        if (!guard) storage.write(`${BASE}/tmp/other/output.txt`, "other\n");
        const fault = interruptWrite(storage, 1, false);
        assert.throws(invoke, /fixture-interrupted/);
        fault.restore();
        const journal = readPrepared(storage);
        if (guard) {
          const dossier = readDossier(storage, KEY);
          storage.write(
            `${BASE}/TASK.md`,
            serializeDossier(
              { ...requireManaged(dossier), title: "External edit" },
              dossier.body,
            ),
          );
        } else {
          // TASK after + manifest before недостижимы при объявленном manifest → TASK порядке.
          const task = journal.data.writes.find((write) =>
            write.path.endsWith("/TASK.md"),
          );
          assert.ok(task);
          storage.write(task.path, task.after);
        }
        const taskBytes = storage.read(`${BASE}/TASK.md`);
        const manifestBytes = storage.read(`${BASE}/artifact-manifest.json`);
        const pendingBytes = storage.read(
          workspaceOperationPaths(KEY).pending,
          64 * 1024 * 1024,
        );
        assert.throws(invoke, (error) =>
          hasCode(error, "metadata_state_conflict"),
        );
        assert.deepEqual(storage.read(`${BASE}/TASK.md`), taskBytes);
        assert.deepEqual(
          storage.read(`${BASE}/artifact-manifest.json`),
          manifestBytes,
        );
        assert.deepEqual(
          storage.read(workspaceOperationPaths(KEY).pending, 64 * 1024 * 1024),
          pendingBytes,
        );
      },
    );
});

test("P04: producer preparation не пишет файлы и принимает prospective settlement metadata", (context) => {
  const storage = fixture(context);
  seed(storage);
  storage.write(`${BASE}/tmp/work/output.txt`, "prepare-only\n");
  const dossier = readDossier(storage, KEY);
  const manifest = readArtifacts(storage, dossier);
  const beforeTask = storage.read(`${BASE}/TASK.md`);
  const beforeManifest = storage.read(`${BASE}/artifact-manifest.json`);
  const immutableInputs = structuredClone({ dossier, manifest });
  const original = storage.write;
  storage.write = () => {
    throw new Error("Preparation must not write");
  };
  const registration = prepareWorkspaceRegistration(
    storage,
    dossier,
    manifest,
    { artifacts: [item(false)] },
    { now: requireManaged(dossier).updatedAt },
  );
  const registered = { ...dossier, meta: registration.meta };
  const settlement = prepareWorkspaceSettlement(
    storage,
    registered,
    registration.manifest,
    { artifactIds: [registration.manifest.artifacts[0].id] },
    { now: requireManaged(dossier).updatedAt },
  );
  const result = prepareWorkspaceCleanupPlan(
    storage,
    { ...dossier, meta: settlement.meta },
    settlement.manifest,
    undefined,
    undefined,
    {
      requestId: "00000000-0000-4000-8000-000000000001",
      now: requireManaged(dossier).updatedAt,
    },
  );
  storage.write = original;
  assert.equal(result.plan.taskRevision, 3);
  assert.equal(result.plan.manifestRevision, 3);
  assert.equal(result.plan.items[0].artifactRevision, 2);
  assert.equal(storage.exists(result.file), false);
  assert.deepEqual({ dossier, manifest }, immutableInputs);
  assert.deepEqual(storage.read(`${BASE}/TASK.md`), beforeTask);
  assert.deepEqual(
    storage.read(`${BASE}/artifact-manifest.json`),
    beforeManifest,
  );
});

test("P04: новый процесс продолжает частичную create с прежними UUID, временем и bytes", (context) => {
  const storage = fixture(context);
  const script = `
    import {WorkspaceFs} from ${JSON.stringify(new URL("../src/filesystem/WorkspaceFs.adapter.mjs", import.meta.url).href)};
    import {createDossier} from ${JSON.stringify(new URL("../src/dossier/createDossier.service.mjs", import.meta.url).href)};
    const storage = new WorkspaceFs(process.argv[1]);
    const original = storage.write.bind(storage);
    storage.write = (file, bytes, exclusive) => {
      if (process.argv[2] === "interrupt" && file === ${JSON.stringify(`${BASE}/TASK.md`)}) process.exit(73);
      return original(file, bytes, exclusive);
    };
    const result = createDossier(storage, ${JSON.stringify(ORIGINAL)}, false, {operationId: "process-create"});
    process.stdout.write(JSON.stringify(result));
    storage.close();
  `;
  /** @param {string} mode */
  const run = (mode) =>
    spawnSync(
      process.execPath,
      [
        "--import=tsx/esm",
        "--input-type=module",
        "-e",
        script,
        storage.root,
        mode,
      ],
      { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 },
    );
  const interrupted = run("interrupt");
  assert.equal(interrupted.status, 73, interrupted.stderr);
  assert.equal(storage.exists(`${BASE}/artifact-manifest.json`), true);
  assert.equal(storage.exists(`${BASE}/TASK.md`), false);
  const pending = readPrepared(storage);
  const resumed = run("resume");
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.deepEqual(JSON.parse(resumed.stdout), pending.data.result);
  for (const write of pending.data.writes)
    assert.equal(storage.read(write.path).toString("utf8"), write.after);
  const replayed = run("replay");
  assert.equal(replayed.status, 0, replayed.stderr);
  assert.equal(replayed.stdout, resumed.stdout);
});

test("P04: completed replay всех обычных owners проверяет UUID текущего досье", async (context) => {
  for (const operation of operations)
    await context.test(operation.name, (subcontext) => {
      const storage = fixture(subcontext);
      operation.setup(storage);
      const options = { operationId: `identity-${operation.name}` };
      operation.invoke(storage, options);
      const dossier = readDossier(storage, KEY);
      storage.write(
        `${BASE}/TASK.md`,
        serializeDossier(
          {
            ...requireManaged(dossier),
            localDossierId: "00000000-0000-4000-8000-000000000002",
          },
          dossier.body,
        ),
      );
      const completedPath = workspaceOperationPaths(
        KEY,
        options.operationId,
      ).completed;
      assert.ok(completedPath);
      const completed = storage.read(completedPath, 64 * 1024 * 1024);
      const task = storage.read(`${BASE}/TASK.md`);
      assert.throws(
        () => operation.invoke(storage, options),
        (error) => hasCode(error, "dossier_identity_mismatch"),
      );
      assert.deepEqual(storage.read(`${BASE}/TASK.md`), task);
      assert.deepEqual(
        storage.read(completedPath, 64 * 1024 * 1024),
        completed,
      );
    });
});

test("P04: новый cleanup plan проверяет свежих consumers; явный completed ID возвращает исходный plan", (context) => {
  const storage = fixture(context);
  seed(storage);
  seedArtifact(storage, true);
  const first = planWorkspaceCleanup(storage, KEY, 2);
  const second = planWorkspaceCleanup(storage, KEY, 2);
  assert.notEqual(first.plan.requestId, second.plan.requestId);
  const plannerCompleted = workspaceOperationPaths(
    KEY,
    `plan-cleanup-${first.plan.requestId}`,
  ).completed;
  assert.ok(plannerCompleted);
  assert.equal(storage.exists(plannerCompleted), true);
  const cleanupCompleted = workspaceOperationPaths(
    KEY,
    first.plan.requestId,
  ).completed;
  assert.ok(cleanupCompleted);
  assert.equal(storage.exists(cleanupCompleted), false);
  const explicitOptions = { operationId: "explicit-plan" };
  const saved = planWorkspaceCleanup(
    storage,
    KEY,
    2,
    undefined,
    undefined,
    explicitOptions,
  );
  const pathsBefore = storage.list(`${BASE}/logs/cleanup-plans`);
  storage.write(
    "tests/consumer.test.ts",
    `const input = ${JSON.stringify(`${BASE}/tmp/work/output.txt`)};\n`,
  );
  assert.throws(
    () => planWorkspaceCleanup(storage, KEY, 2),
    (error) => hasCode(error, "source_reference_active"),
  );
  assert.deepEqual(
    planWorkspaceCleanup(
      storage,
      KEY,
      2,
      undefined,
      undefined,
      explicitOptions,
    ),
    saved,
  );
  assert.deepEqual(storage.list(`${BASE}/logs/cleanup-plans`), pathsBefore);
  assert.equal(storage.exists(workspaceOperationPaths(KEY).pending), false);
});

test("P04: recovery сохраняет отсутствие второго досье, объявленное до прерывания", async (context) => {
  for (const initialize of [true, false])
    await context.test(
      initialize ? "partial create" : "pending status",
      (subcontext) => {
        const storage = fixture(subcontext);
        if (!initialize) seed(storage);
        const operationId = initialize ? "create-absence" : "status-absence";
        const invoke = initialize
          ? () => createDossier(storage, ORIGINAL, false, { operationId })
          : () =>
              updateDossier(
                storage,
                KEY,
                1,
                { category: "active" },
                { operationId },
              );
        const fault = interruptWrite(storage, 1, initialize);
        assert.throws(invoke, /fixture-interrupted/);
        fault.restore();
        const history = `.ai-workspace/history/${KEY}`;
        storage.write(
          `${history}/TASK.md`,
          "# Чужое досье, появившееся после prepare\n",
        );
        const taskBefore = storage.exists(`${BASE}/TASK.md`)
          ? storage.read(`${BASE}/TASK.md`)
          : null;
        const historyBefore = storage.read(`${history}/TASK.md`);
        const manifestBefore = storage.read(`${BASE}/artifact-manifest.json`);
        const pendingBefore = storage.read(
          workspaceOperationPaths(KEY).pending,
          64 * 1024 * 1024,
        );
        const pending = readPrepared(storage);
        assert.deepEqual(pending.data.absentPaths, [
          initialize ? history : `${history}/TASK.md`,
        ]);
        assert.throws(invoke, (error) =>
          hasCode(error, "metadata_state_conflict"),
        );
        assert.throws(
          () =>
            recoverWorkspaceOperation(storage, KEY, operationId, {
              create: resumeWorkspaceMetadataOperation,
              status: resumeWorkspaceMetadataOperation,
            }),
          (error) => hasCode(error, "metadata_state_conflict"),
        );
        assert.deepEqual(
          storage.exists(`${BASE}/TASK.md`)
            ? storage.read(`${BASE}/TASK.md`)
            : null,
          taskBefore,
        );
        assert.deepEqual(storage.read(`${history}/TASK.md`), historyBefore);
        assert.deepEqual(
          storage.read(`${BASE}/artifact-manifest.json`),
          manifestBefore,
        );
        assert.deepEqual(
          storage.read(workspaceOperationPaths(KEY).pending, 64 * 1024 * 1024),
          pendingBefore,
        );
      },
    );
});
