/**
 * @file .ai/tools/task-workspace/test/workspaceRecoveryFlows.test.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Проверяет recovery очистки, переносов и старых журналов на временных хранилищах и после выхода процесса.
 * @see documentation/specifications/task-management-execution.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { WorkspaceFs } from "../src/filesystem/WorkspaceFs.adapter.mjs";
import { createDossier } from "../src/dossier/createDossier.service.mjs";
import { updateDossier } from "../src/dossier/updateDossier.service.mjs";
import { registerWorkspaceArtifacts } from "../src/artifacts/registerWorkspaceArtifacts.service.mjs";
import { planWorkspaceCleanup } from "../src/cleanup/planWorkspaceCleanup.service.mjs";
import { applyWorkspaceCleanup } from "../src/cleanup/applyWorkspaceCleanup.service.mjs";
import { prepareWorkspaceCleanupOperation } from "../src/cleanup/prepareWorkspaceCleanupOperation.service.mjs";
import { moveDossier } from "../src/dossier/moveDossier.service.mjs";
import {
  readDossier,
  readArtifacts,
  requireManaged,
} from "../src/dossier/Dossier.repository.mjs";
import { recoverWorkspaceTaskOperation } from "../src/cli/workspaceRecoveryHandlers.config.mjs";
import { readWorkspaceOperationState } from "../src/recovery/WorkspaceOperation.repository.mjs";
import { runtimeRoot } from "../src/workspacePaths.config.mjs";

/** @param {import("node:test").TestContext} context */
function fixture(context) {
  const root = fs.mkdtempSync("/tmp/realize-recovery-flows-");
  const storage = new WorkspaceFs(root);
  context.after(() => {
    storage.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const key = "recovery-fixture";
  createDossier(storage, {
    key,
    title: "Проверка восстановления",
    body: "# Проверка\n",
  });
  return { root, storage, key };
}
/** @param {import("node:test").TestContext} context @param {boolean} [custom] */
function planned(context, custom = false) {
  const value = fixture(context);
  const { storage, key } = value;
  const dossier = readDossier(storage, key);
  assert.ok(dossier.meta);
  storage.write(`${dossier.base}/tmp/cache/one.txt`, "one\n");
  storage.write(`${dossier.base}/tmp/cache/two.txt`, "two\n");
  registerWorkspaceArtifacts(storage, key, dossier.meta.revision, {
    artifacts: [
      {
        path: "tmp/cache",
        category: "temporary",
        stageId: null,
        attemptId: null,
        producer: { id: "test", pid: null, settled: true },
        retention: {
          mode: "temporary",
          pinned: false,
          keepReason: null,
          referencedBy: [],
        },
      },
    ],
  });
  const output = planWorkspaceCleanup(
    storage,
    key,
    requireManaged(readDossier(storage, key)).revision,
    ["tmp/cache"],
    custom ? "logs/exact-plan.json" : undefined,
  );
  return { ...value, ...output };
}
/** @param {WorkspaceFs} storage @param {string} key */
function pending(storage, key) {
  return readWorkspaceOperationState(storage, key).pending;
}

/** @param {WorkspaceFs} storage @param {string} key */
function requiredPending(storage, key) {
  const operation = pending(storage, key);
  assert.ok(operation);
  return operation;
}
/** @param {import("../src/recovery/WorkspaceOperation.types.ts").WorkspaceOperationJournal} operation */
function cleanupState(operation) {
  assert.equal(operation.kind, "cleanup");
  return /** @type {import("../src/cleanup/WorkspaceCleanup.types.ts").WorkspaceCleanupOperation} */ (
    operation.data.cleanup
  );
}
/** @param {WorkspaceFs} storage @param {string} file @returns {Record<string, unknown>} */
function readRecord(storage, file) {
  const value = storage.json(file);
  assert.ok(
    typeof value === "object" && value !== null && !Array.isArray(value),
  );
  return /** @type {Record<string, unknown>} */ (value);
}

test("V13: исходная очистка продолжается на каждой границе, pending запрещает новый status и план", async (context) => {
  for (const phase of [
    "beforeRename",
    "afterRename",
    "afterQuarantine",
    "beforePurge",
    "afterPurgeEffect",
    "afterPurge",
    "beforePublish",
    "afterPublish",
  ]) {
    await context.test(phase, (context) => {
      const { storage, key, plan, file } = planned(context, true);
      assert.throws(
        () =>
          applyWorkspaceCleanup(storage, plan, {
            planPath: file,
            hook(current) {
              if (current === phase) throw new Error("stop");
            },
          }),
        /stop/,
      );
      const operation = requiredPending(storage, key);
      assert.equal(operation.operationId, plan.requestId);
      assert.equal(cleanupState(operation).planPath, file);
      const revision = requireManaged(readDossier(storage, key)).revision;
      assert.throws(
        () => updateDossier(storage, key, revision, { category: "active" }),
        { code: "operation_recovery_required" },
      );
      assert.throws(() => planWorkspaceCleanup(storage, key, revision), {
        code: "operation_recovery_required",
      });
      assert.equal(
        requireManaged(readDossier(storage, key)).revision,
        revision,
      );
      const result = recoverWorkspaceTaskOperation(
        storage,
        key,
        plan.requestId,
      );
      assert.equal(result.status, "completed");
      assert.equal(pending(storage, key), null);
      assert.equal(
        storage.exists(`.ai-workspace/tasks/${key}/tmp/cache`),
        false,
      );
      const beforeReplay = readDossier(storage, key).documentHash;
      assert.deepEqual(
        recoverWorkspaceTaskOperation(storage, key, plan.requestId),
        result,
      );
      assert.deepEqual(
        applyWorkspaceCleanup(storage, plan, { planPath: file }),
        result,
      );
      assert.equal(readDossier(storage, key).documentHash, beforeReplay);
    });
  }
});

test("V13: purging допускает только узнаваемый остаток, чужой файл сохраняется", async (context) => {
  for (const foreign of [false, true])
    await context.test(String(foreign), (context) => {
      const { storage, key, plan, file } = planned(context);
      assert.throws(
        () =>
          applyWorkspaceCleanup(storage, plan, {
            planPath: file,
            hook(phase, item) {
              if (phase !== "beforePurge") return;
              assert.ok("quarantine" in item);
              storage.unlink(`${item.quarantine}/one.txt`);
              if (foreign)
                storage.write(`${item.quarantine}/foreign.txt`, "preserve\n");
              throw new Error("stop");
            },
          }),
        /stop/,
      );
      if (foreign) {
        assert.throws(
          () => recoverWorkspaceTaskOperation(storage, key, plan.requestId),
          { code: "quarantine_changed" },
        );
        assert.equal(
          storage
            .read(
              `${cleanupState(requiredPending(storage, key)).items[0].quarantine}/foreign.txt`,
            )
            .toString(),
          "preserve\n",
        );
      } else
        assert.equal(
          recoverWorkspaceTaskOperation(storage, key, plan.requestId).status,
          "completed",
        );
    });
});

test("V12: cleanup metadata допускает manifest→TASK; обратная смесь блокируется", async (context) => {
  for (const impossible of [false, true])
    await context.test(String(impossible), (context) => {
      const { storage, key, plan, file } = planned(context);
      assert.throws(
        () =>
          applyWorkspaceCleanup(storage, plan, {
            planPath: file,
            hook(phase) {
              if (phase === "beforePublish") throw new Error("stop");
            },
          }),
        /stop/,
      );
      const operation = requiredPending(storage, key);
      const writes =
        /** @type {import("../src/recovery/WorkspaceOperation.types.ts").WorkspaceFileWrite[]} */ (
          operation.data.cleanupMetadataCursorWrites
        );
      const chosen = impossible ? writes[1] : writes[0];
      storage.write(chosen.path, chosen.after);
      if (impossible)
        assert.throws(
          () => recoverWorkspaceTaskOperation(storage, key, plan.requestId),
          { code: "metadata_state_conflict" },
        );
      else
        assert.equal(
          recoverWorkspaceTaskOperation(storage, key, plan.requestId).status,
          "completed",
        );
    });
});

test("V14: legacy cleanup требует исходный planPath и сохраняет старый формат", (context) => {
  const { root, storage, key, plan, file } = planned(context, true);
  const prepared = prepareWorkspaceCleanupOperation(storage, plan, file);
  fs.rmSync(path.join(root, runtimeRoot), { recursive: true, force: true });
  const journalPath = `${runtimeRoot}/operations/${plan.requestId}.json`;
  storage.writeJson(journalPath, {
    schemaVersion: 1,
    kind: "cleanup",
    key,
    phase: "prepared",
    planHash: plan.hash,
    bodyHash: prepared.bodyHash,
    items: prepared.items,
    taskBefore: prepared.taskBefore,
    manifestBefore: prepared.manifestBefore,
  });
  assert.throws(
    () => recoverWorkspaceTaskOperation(storage, key, plan.requestId),
    { code: "original_plan_required" },
  );
  assert.throws(
    () =>
      updateDossier(storage, key, plan.taskRevision, { category: "active" }),
    { code: "operation_recovery_required" },
  );
  const result = applyWorkspaceCleanup(storage, plan, { planPath: file });
  assert.equal(result.status, "completed");
  assert.equal(readRecord(storage, journalPath).phase, "completed");
  assert.equal(readRecord(storage, journalPath).kind, "cleanup");
  assert.equal(pending(storage, key), null);
});

test("V13: archive и reopen возобновляются после rename и metadata без повторного эффекта", async (context) => {
  for (const reopen of [false, true])
    for (const phase of [
      "beforeMove",
      "afterMove",
      "beforePublish",
      "afterPublish",
    ])
      await context.test(`${reopen}/${phase}`, (context) => {
        const { storage, key } = fixture(context);
        updateDossier(storage, key, 1, {
          category: "closed",
          outcome: "cancelled",
          cancellationReason: "Проверка",
        });
        if (reopen) moveDossier(storage, key, 2);
        const revision = requireManaged(readDossier(storage, key)).revision;
        assert.throws(
          () =>
            moveDossier(storage, key, revision, reopen, {
              hook(current) {
                if (current === phase) throw new Error("stop");
              },
            }),
          /stop/,
        );
        const operation = requiredPending(storage, key);
        const result = recoverWorkspaceTaskOperation(
          storage,
          key,
          operation.operationId,
        );
        assert.equal(result.revision, revision + 1);
        assert.equal(
          readDossier(storage, key).base,
          `.ai-workspace/${reopen ? "tasks" : "history"}/${key}`,
        );
        assert.deepEqual(
          recoverWorkspaceTaskOperation(storage, key, operation.operationId),
          result,
        );
      });
});

test("V14: реальный выход процесса после quarantine и восстановление другим процессом", (context) => {
  const { root, storage, key, plan, file } = planned(context);
  const storageModule = new URL(
    "../src/filesystem/WorkspaceFs.adapter.mjs",
    import.meta.url,
  ).href;
  const applyModule = new URL(
    "../src/cleanup/applyWorkspaceCleanup.service.mjs",
    import.meta.url,
  ).href;
  const recoveryModule = new URL(
    "../src/cli/workspaceRecoveryHandlers.config.mjs",
    import.meta.url,
  ).href;
  const first = `import { WorkspaceFs } from ${JSON.stringify(storageModule)}; import { applyWorkspaceCleanup } from ${JSON.stringify(applyModule)}; const storage=new WorkspaceFs(process.argv[1]); const file=process.argv[2]; applyWorkspaceCleanup(storage,storage.json(file),{planPath:file,hook(phase){if(phase==='afterQuarantine')process.exit(23)}});`;
  /** @param {string} source @param {string[]} args */
  const run = (source, ...args) =>
    spawnSync(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx/esm"),
        "--input-type=module",
        "--eval",
        source,
        ...args,
      ],
      { encoding: "utf8", timeout: 20000 },
    );
  const interrupted = run(first, root, file);
  assert.equal(interrupted.status, 23, interrupted.stderr);
  assert.equal(requiredPending(storage, key).operationId, plan.requestId);
  const second = `import { WorkspaceFs } from ${JSON.stringify(storageModule)}; import { recoverWorkspaceTaskOperation } from ${JSON.stringify(recoveryModule)}; const storage=new WorkspaceFs(process.argv[1]); try{console.log(JSON.stringify(recoverWorkspaceTaskOperation(storage,process.argv[2],process.argv[3])))}finally{storage.close()}`;
  const recovered = run(second, root, key, plan.requestId);
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(JSON.parse(recovered.stdout).status, "completed");
  assert.equal(
    readArtifacts(storage, readDossier(storage, key)).artifacts[0].state,
    "deleted",
  );
});

test("V14: legacy archive продолжается на месте старого журнала после фактического rename", (context) => {
  const { root, storage, key } = fixture(context);
  updateDossier(storage, key, 1, {
    category: "closed",
    outcome: "cancelled",
    cancellationReason: "Проверка",
  });
  assert.throws(
    () =>
      moveDossier(storage, key, 2, false, {
        hook(phase) {
          if (phase === "afterMove") throw new Error("stop");
        },
      }),
    /stop/,
  );
  const current = requiredPending(storage, key);
  const state =
    /** @type {import("../src/dossier/DossierMove.types.ts").DossierMoveOperation} */ (
      current.data.move
    );
  fs.rmSync(path.join(root, runtimeRoot), { recursive: true, force: true });
  const legacyPath = `${runtimeRoot}/operations/${key}-archive-2.json`;
  storage.writeJson(legacyPath, {
    kind: "archive",
    key,
    phase: "moving",
    source: state.source,
    destination: state.destination,
    before: state.before,
    after: state.after,
    bodyHash: state.bodyHash,
    manifestHash: state.manifestHash,
  });
  const result = recoverWorkspaceTaskOperation(
    storage,
    key,
    `${key}-archive-2`,
  );
  assert.equal(result.revision, 3);
  assert.equal(readRecord(storage, legacyPath).phase, "completed");
  assert.equal(pending(storage, key), null);
});

test("V14: повреждённый completed legacy cleanup не возвращает ложный успех", (context) => {
  const { root, storage, key, plan, file } = planned(context, true);
  const state = prepareWorkspaceCleanupOperation(storage, plan, file);
  fs.rmSync(path.join(root, runtimeRoot), { recursive: true, force: true });
  const journalPath = `${runtimeRoot}/operations/${plan.requestId}.json`;
  storage.writeJson(journalPath, {
    schemaVersion: 1,
    kind: "cleanup",
    key,
    phase: "prepared",
    planHash: plan.hash,
    bodyHash: state.bodyHash,
    items: state.items,
    taskBefore: state.taskBefore,
    manifestBefore: state.manifestBefore,
  });
  applyWorkspaceCleanup(storage, plan, { planPath: file });
  const damaged = readRecord(storage, journalPath);
  delete damaged.result;
  storage.writeJson(journalPath, damaged);
  assert.throws(
    () => recoverWorkspaceTaskOperation(storage, key, plan.requestId),
    { code: "legacy_operation_invalid" },
  );
});

test("Direct cleanup отвергает неправильный original planPath до pending и эффектов", (context) => {
  const { storage, key, plan } = planned(context);
  const before = readDossier(storage, key).documentHash;
  assert.throws(
    () =>
      applyWorkspaceCleanup(storage, plan, { planPath: "missing-plan.json" }),
    { code: "cleanup_plan_binding_conflict" },
  );
  storage.writeJson("wrong-plan.json", { ...plan, hash: "0".repeat(64) });
  assert.throws(
    () => applyWorkspaceCleanup(storage, plan, { planPath: "wrong-plan.json" }),
    { code: "cleanup_plan_binding_conflict" },
  );
  assert.equal(pending(storage, key), null);
  assert.equal(readDossier(storage, key).documentHash, before);
  assert.ok(storage.exists(`.ai-workspace/tasks/${key}/tmp/cache/one.txt`));
});
