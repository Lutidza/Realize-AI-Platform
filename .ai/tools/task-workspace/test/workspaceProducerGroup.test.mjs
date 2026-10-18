/**
 * @file .ai/tools/task-workspace/test/workspaceProducerGroup.test.mjs
 * @version 1.0.4
 * @date 2026-10-15
 * @description Проверяет exact producer-group lifecycle, consumer guards и восстановимый pending на собственных /tmp fixtures.
 * @see documentation/specifications/task-management-execution.md
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { WorkspaceFs } from "../src/filesystem/WorkspaceFs.adapter.mjs";
import { createDossier } from "../src/dossier/createDossier.service.mjs";
import { updateDossier } from "../src/dossier/updateDossier.service.mjs";
import { publishWorkspaceResult } from "../src/artifacts/publishWorkspaceResult.service.mjs";
import { moveDossier } from "../src/dossier/moveDossier.service.mjs";
import {
  readDossier,
  readArtifacts,
  serializeDossier,
  requireManaged,
} from "../src/dossier/Dossier.repository.mjs";
import { snapshotTree } from "../src/filesystem/snapshotTree.adapter.mjs";
import {
  beginWorkspaceProducerGroup,
  finalizeWorkspaceProducerGroup,
} from "../src/producer-group/workspaceProducerGroup.index.mjs";

import { recoverWorkspaceOperation } from "../src/recovery/recoverWorkspaceOperation.service.mjs";
import { readPendingWorkspaceOperation } from "../src/recovery/WorkspaceOperation.repository.mjs";
import { resumeWorkspaceProducerOperation } from "../src/producer-group/resumeWorkspaceProducerOperation.service.mjs";

/** @typedef {{root:string, storage:WorkspaceFs, key:string}} ProducerFixture */
/** @typedef {import("../src/producer-group/WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup} ProducerGroup */
/** @typedef {import("../src/producer-group/WorkspaceProducerGroup.types.ts").WorkspaceProducerGroupInput} ProducerInput */
/** @typedef {import("../src/dossier/Dossier.types.ts").WorkspaceArtifactManifest} ArtifactManifest */

const KEY = "producer-fixture";
const STAGE = "fixture-browser";
const PATHS = [
  "logs/task-browser-cafe",
  "screenshots/task-browser-cafe",
  "tmp/task-browser-cafe",
];

/** @param {import("node:test").TestContext} context @param {boolean} [managed] */
function fixture(context, managed = true) {
  const root = fs.mkdtempSync("/tmp/realize-producer-group-");
  const storage = new WorkspaceFs(root);
  context.after(() => {
    storage.close();
    assert.ok(root.startsWith("/tmp/realize-producer-group-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  if (managed)
    createDossier(storage, {
      key: KEY,
      title: "Producer group fixture",
      body: "# Изолированный fixture\n",
    });
  return { root, storage, key: KEY };
}

/** @param {ProducerFixture} value */
function dossier(value) {
  return readDossier(value.storage, value.key);
}
/** @param {ProducerFixture} value */
function managed(value) {
  const current = dossier(value);
  return { ...current, meta: requireManaged(current) };
}
/** @param {ProducerFixture} value */
function manifest(value) {
  return readArtifacts(value.storage, dossier(value));
}
/** @param {ProducerInput["artifacts"]} [artifacts] @returns {ProducerInput} */
function input(artifacts) {
  return {
    stageId: STAGE,
    attemptId: randomUUID(),
    artifacts:
      artifacts ??
      PATHS.map((relative, index) => ({
        path: relative,
        category: /** @type {const} */ (["log", "screenshot", "temporary"])[
          index
        ],
      })),
  };
}
/** @param {ProducerFixture} value @param {ProducerInput["artifacts"]} [artifacts] */
function begin(value, artifacts) {
  return beginWorkspaceProducerGroup(
    value.storage,
    value.key,
    input(artifacts),
  );
}
/** @param {ProducerFixture} value @param {ProducerGroup} group @param {Partial<import("../src/producer-group/WorkspaceProducerGroup.types.ts").WorkspaceProducerGroupFinalizationInput>} [overrides] */
function finish(value, group, overrides = {}) {
  return finalizeWorkspaceProducerGroup(value.storage, group, {
    quiescent: true,
    cleanupTemporary: true,
    ...overrides,
  });
}
/** @param {ProducerFixture} value @param {ProducerGroup} group @param {string} [text] */
function output(value, group, text = "fixture bytes\n") {
  for (const relative of group.paths)
    value.storage.write(
      `${dossier(value).base}/${relative}/generated.txt`,
      text,
    );
}
/** @param {ProducerFixture} value @param {unknown} update */
function mutate(value, update) {
  const current = managed(value);
  updateDossier(value.storage, value.key, current.meta.revision, update);
  return managed(value).meta;
}
/** @param {ProducerFixture} value @param {(manifest:ArtifactManifest)=>void} operation */
function changeManifest(value, operation) {
  const current = dossier(value),
    data = manifest(value);
  operation(data);
  value.storage.writeJson(`${current.base}/artifact-manifest.json`, data);
}
/** @param {ProducerFixture} value */
function bumpRevision(value) {
  const current = managed(value);
  value.storage.write(
    `${current.base}/TASK.md`,
    serializeDossier(
      {
        ...current.meta,
        revision: current.meta.revision + 1,
      },
      current.body,
    ),
  );
}
/** @param {()=>unknown} operation @param {string} code */
function expectCode(operation, code) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof Error && "code" in error);
    assert.equal(error.code, code);
    return true;
  });
}

/** @param {()=>unknown} operation @returns {Error & {operation:import("../src/recovery/WorkspaceOperation.types.ts").WorkspaceOperationReference}} */
function captureProducerFailure(operation) {
  try {
    operation();
  } catch (error) {
    assert.ok(error instanceof Error && "operation" in error);
    return /** @type {Error & {operation:import("../src/recovery/WorkspaceOperation.types.ts").WorkspaceOperationReference}} */ (
      error
    );
  }
  assert.fail("Ожидалось прерывание producer operation");
}

test("Успешный и ошибочный caller завершают одну группу с точной очисткой generated temporary bytes", async (context) => {
  for (const callerFailed of [false, true])
    await context.test(
      callerFailed ? "failed caller" : "successful caller",
      (child) => {
        const value = fixture(child);
        value.storage.write(
          `${dossier(value).base}/tmp/unrelated/sentinel.txt`,
          "unrelated bytes\n",
        );
        const beforeTask = managed(value);
        const group = begin(value);
        assert.deepEqual(group.paths, PATHS);
        assert.ok(Object.isFrozen(group));
        assert.ok(Object.isFrozen(group.artifactIds));
        assert.equal(group.localDossierId, beforeTask.meta.localDossierId);
        const initial = manifest(value);
        assert.equal(initial.artifacts.length, 3);
        for (const artifact of initial.artifacts) {
          assert.equal(artifact.producer.pid, null);
          assert.equal(artifact.producer.identity, null);
          assert.equal(artifact.producer.settled, false);
          assert.equal(artifact.stageId, group.stageId);
          assert.equal(artifact.attemptId, group.attemptId);
          assert.equal(artifact.bytes, 0);
          assert.equal(
            artifact.retention.mode,
            artifact.category === "temporary" ? "temporary" : "retain",
          );
        }
        let summary;
        try {
          output(
            value,
            group,
            callerFailed
              ? "fixture failure evidence\n"
              : "fixture success evidence\n",
          );
          if (callerFailed) throw new Error("expected caller failure");
        } catch (error) {
          assert.ok(error instanceof Error);
          assert.equal(error.message, "expected caller failure");
        } finally {
          summary = finish(value, group);
        }
        assert.equal(summary.status, "completed");
        assert.equal(summary.cleanup.status, "completed");
        assert.deepEqual(summary.cleanup.paths, [PATHS[2]]);
        assert.ok(summary.cleanup.receipt);
        assert.deepEqual(summary.cleanup.receipt.paths, [PATHS[2]]);
        assert.equal(
          value.storage.exists(`${dossier(value).base}/${PATHS[2]}`),
          false,
        );
        assert.equal(
          value.storage
            .read(`${dossier(value).base}/tmp/unrelated/sentinel.txt`)
            .toString(),
          "unrelated bytes\n",
        );
        for (const artifact of manifest(value).artifacts) {
          assert.equal(artifact.revision, 2);
          assert.equal(artifact.producer.settled, true);
          assert.ok(artifact.bytes > 0);
          const original = initial.artifacts.find(
            (item) => item.id === artifact.id,
          );
          assert.ok(original);
          assert.notEqual(artifact.hash, original.hash);
          assert.equal(
            artifact.state,
            artifact.category === "temporary" ? "deleted" : "ready",
          );
          if (artifact.state === "ready")
            assert.equal(
              snapshotTree(
                value.storage,
                `${dossier(value).base}/${artifact.path}`,
              ).hash,
              artifact.hash,
            );
        }
        assert.equal(dossier(value).body, beforeTask.body);
        assert.deepEqual(managed(value).meta.status, beforeTask.meta.status);
        assert.equal(managed(value).meta.result, null);
        assert.equal(managed(value).meta.archivedAt, null);
      },
    );
});

test("quiescent:false сохраняет все trees и unsettled metadata без revision mutation", (context) => {
  const value = fixture(context),
    group = begin(value);
  output(value, group);
  const task = managed(value).meta,
    artifacts = manifest(value);
  const summary = finish(value, group, { quiescent: false });
  assert.equal(summary.status, "blocked");
  assert.equal(summary.reason, "producer_group_not_quiescent");
  assert.deepEqual(managed(value).meta, task);
  assert.deepEqual(manifest(value), artifacts);
  for (const relative of group.paths)
    assert.ok(
      value.storage.exists(`${dossier(value).base}/${relative}/generated.txt`),
    );
});

test("cleanupTemporary:false закрепляет свежий snapshot и сохраняет временные outputs", (context) => {
  const value = fixture(context),
    group = begin(value);
  output(value, group);
  const summary = finish(value, group, { cleanupTemporary: false });
  assert.equal(summary.status, "completed");
  assert.equal(summary.cleanup.status, "not_requested");
  for (const artifact of manifest(value).artifacts) {
    assert.equal(artifact.producer.settled, true);
    assert.equal(artifact.state, "ready");
  }
});

test("Группа retained artifacts завершается без cleanup plan", (context) => {
  const value = fixture(context),
    group = begin(value, [{ path: PATHS[0], category: "log" }]);
  output(value, group);
  const summary = finish(value, group);
  assert.equal(summary.status, "completed");
  assert.equal(summary.cleanup.status, "not_needed");
  assert.deepEqual(summary.cleanup.paths, []);
  assert.equal(
    value.storage.exists(`${dossier(value).base}/logs/cleanup-plans`),
    false,
  );
});

test("Retain, pin, keepReason и consumer references блокируют atomic finalize до settle", async (context) => {
  for (const retention of [
    { mode: "retain" },
    { pinned: true },
    { keepReason: "Нужен review" },
    { referencedBy: ["other-consumer"] },
  ])
    await context.test(JSON.stringify(retention), (child) => {
      const value = fixture(child),
        group = begin(value);
      output(value, group);
      changeManifest(value, (data) =>
        Object.assign(data.artifacts[2].retention, retention),
      );
      const before = manifest(value),
        beforeTask = managed(value).meta;
      const summary = finish(value, group);
      assert.equal(summary.status, "blocked");
      assert.equal(summary.cleanup.reason, "artifact_retained");
      assert.deepEqual(manifest(value), before);
      assert.deepEqual(managed(value).meta, beforeTask);
      assert.equal(
        readPendingWorkspaceOperation(value.storage, value.key),
        null,
      );
      assert.ok(
        value.storage.exists(
          `${dossier(value).base}/${PATHS[2]}/generated.txt`,
        ),
      );
    });
});

test("Active execution другого attempt текущего TASK нельзя обойти собственным quiescent:true", (context) => {
  const value = fixture(context),
    group = begin(value);
  output(value, group);
  const execution = {
    state: "running",
    runtimeRef: { owner: "other-runtime", id: "other-run" },
    stageId: "other-stage",
    attemptId: randomUUID(),
  };
  mutate(value, { execution });
  const summary = finish(value, group);
  assert.equal(summary.status, "blocked");
  assert.equal(summary.reason, "execution_not_quiescent");
  assert.deepEqual(managed(value).meta.execution, execution);
  assert.ok(value.storage.exists(`${dossier(value).base}/${PATHS[2]}`));
});

test("Source consumer и busy соседний TASK с ссылкой удерживают exact temporary tree", async (context) => {
  for (const consumer of ["source", "other task"])
    await context.test(consumer, (child) => {
      const value = fixture(child),
        group = begin(value);
      output(value, group);
      const destination = `${dossier(value).base}/${PATHS[2]}/generated.txt`;
      if (consumer === "source")
        value.storage.write(
          "src/consumer.mjs",
          `export const output = ${JSON.stringify(destination)};\n`,
        );
      else {
        createDossier(value.storage, {
          key: "other-task",
          title: "Consumer",
          body: `[Нужный output](${destination})\n`,
        });
        updateDossier(value.storage, "other-task", 1, {
          execution: {
            state: "running",
            runtimeRef: { owner: "fixture", id: "busy-other-task" },
            stageId: "other-stage",
            attemptId: null,
          },
        });
      }
      const summary = finish(value, group);
      assert.equal(summary.status, "blocked");
      assert.equal(summary.reason, "source_reference_active");
      assert.ok(value.storage.exists(destination));
    });
});

test("Process cwd consumer блокирует purge до фактического child exit", async (context) => {
  const value = fixture(context),
    group = begin(value);
  output(value, group);
  const child = spawn(
    process.execPath,
    ["-e", "process.stdout.write('ready\\n');setInterval(()=>{},1000)"],
    {
      cwd: path.join(value.root, dossier(value).base, PATHS[2]),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  context.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
  });
  await once(child.stdout, "data");
  const blocked = finish(value, group);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.reason, "process_reference_active");
  child.kill("SIGTERM");
  await once(child, "exit");
  assert.equal(finish(value, group).status, "completed");
});

test("Изменение owner, IDs, paths, category, stage, attempt и revision запрещает settle и cleanup", async (context) => {
  /** @type {Array<[string, (manifest:ArtifactManifest)=>void]>} */
  const changes = [
    [
      "id",
      (data) => {
        data.artifacts[2].id = randomUUID();
      },
    ],
    [
      "path",
      (data) => {
        data.artifacts[2].path = "tmp/other-path";
      },
    ],
    [
      "category",
      (data) => {
        data.artifacts[2].category = "log";
      },
    ],
    [
      "stage",
      (data) => {
        data.artifacts[2].stageId = "other-stage";
      },
    ],
    [
      "attempt",
      (data) => {
        data.artifacts[2].attemptId = randomUUID();
      },
    ],
    [
      "revision",
      (data) => {
        data.artifacts[2].revision++;
      },
    ],
    [
      "producer",
      (data) => {
        data.artifacts[2].producer.id = "other-producer";
      },
    ],
    [
      "settled",
      (data) => {
        data.artifacts[2].producer.settled = true;
      },
    ],
  ];
  for (const [name, change] of changes)
    await context.test(name, (child) => {
      const value = fixture(child),
        group = begin(value);
      output(value, group);
      changeManifest(value, change);
      const before = manifest(value),
        beforeTask = managed(value).meta;
      const summary = finish(value, group);
      assert.equal(summary.status, "blocked");
      assert.equal(summary.reason, "producer_group_metadata_changed");
      assert.deepEqual(manifest(value), before);
      assert.deepEqual(managed(value).meta, beforeTask);
      assert.ok(value.storage.exists(`${dossier(value).base}/${PATHS[2]}`));
    });
  await context.test("owner", (child) => {
    const value = fixture(child),
      group = begin(value),
      current = managed(value),
      owner = randomUUID();
    value.storage.write(
      `${current.base}/TASK.md`,
      serializeDossier(
        {
          ...current.meta,
          localDossierId: owner,
        },
        current.body,
      ),
    );
    const summary = finish(value, group);
    assert.equal(summary.status, "blocked");
    assert.equal(summary.reason, "producer_group_owner_mismatch");
  });
  await context.test("unbound clone", (child) => {
    const value = fixture(child),
      group = begin(value);
    const unbound = finish(value, structuredClone(group));
    assert.equal(unbound.status, "blocked");
    assert.equal(unbound.reason, "producer_group_unbound");
  });
});

test("Exclusive collision сохраняет preexisting paths и отклоняет begin до создания parents", (context) => {
  const value = fixture(context),
    base = dossier(value).base;
  value.storage.write(
    `${base}/screenshots/collision/sentinel.txt`,
    "preexisting fixture\n",
  );
  expectCode(
    () =>
      begin(value, [
        { path: "tmp/new/deep", category: "temporary" },
        { path: "screenshots/collision", category: "screenshot" },
      ]),
    "producer_path_exists",
  );
  assert.equal(value.storage.exists(`${base}/tmp`), false);
  assert.equal(
    value.storage.read(`${base}/screenshots/collision/sentinel.txt`).toString(),
    "preexisting fixture\n",
  );
  assert.deepEqual(manifest(value).artifacts, []);
});

test("Перекрытие ready registered tree отклоняется до создания нового child directory", (context) => {
  const value = fixture(context);
  const existing = begin(value, [
    { path: "tmp/existing", category: "temporary" },
  ]);
  output(value, existing);
  finish(value, existing, { cleanupTemporary: false });
  const before = manifest(value),
    base = dossier(value).base;
  expectCode(
    () =>
      begin(value, [{ path: "tmp/existing/new-child", category: "temporary" }]),
    "artifact_already_registered",
  );
  assert.equal(value.storage.exists(`${base}/tmp/existing/new-child`), false);
  assert.deepEqual(manifest(value), before);
  assert.equal(
    snapshotTree(value.storage, `${base}/tmp/existing`).hash,
    before.artifacts[0].hash,
  );
});

test("Symlink parent/root и protected/category paths не создают outputs вне owned дерева", async (context) => {
  for (const linked of ["parent", "root"])
    await context.test(linked, (child) => {
      const value = fixture(child),
        base = dossier(value).base;
      const target = path.join(value.root, "outside");
      fs.mkdirSync(target);
      fs.writeFileSync(path.join(target, "sentinel.txt"), "outside fixture\n");
      if (linked === "parent")
        fs.symlinkSync(target, path.join(value.root, base, "tmp"));
      else {
        value.storage.mkdir(`${base}/tmp`);
        fs.symlinkSync(target, path.join(value.root, base, "tmp/linked"));
      }
      expectCode(
        () =>
          begin(value, [
            {
              path: linked === "parent" ? "tmp/output" : "tmp/linked",
              category: "temporary",
            },
          ]),
        "symlink_parent",
      );
      assert.deepEqual(fs.readdirSync(target), ["sentinel.txt"]);
    });
  for (const relative of [
    "tmp/../../escaped",
    "references/wrong",
    "tmp/.env.private",
    "tmp/secret.key",
  ])
    await context.test(relative, (child) => {
      const value = fixture(child);
      assert.throws(() =>
        begin(value, [{ path: relative, category: "temporary" }]),
      );
      assert.equal(value.storage.exists(`${dossier(value).base}/tmp`), false);
    });
});

test("Legacy, closed и archived TASK требуют явного владельческого перехода до mkdir", async (context) => {
  for (const state of ["legacy", "closed", "archived"])
    await context.test(state, (child) => {
      const value = fixture(child, state !== "legacy");
      if (state === "legacy")
        value.storage.write(
          `.ai-workspace/tasks/${value.key}/TASK.md`,
          "# Legacy\n",
        );
      else {
        const closed = mutate(value, {
          category: "closed",
          outcome: "cancelled",
          cancellationReason: "Fixture cancelled",
        });
        if (state === "archived")
          moveDossier(value.storage, value.key, closed.revision);
      }
      const before = value.storage.read(`${dossier(value).base}/TASK.md`);
      expectCode(
        () => begin(value),
        state === "legacy" ? "legacy_requires_adoption" : "reopen_required",
      );
      assert.deepEqual(
        value.storage.read(`${dossier(value).base}/TASK.md`),
        before,
      );
      assert.equal(value.storage.exists(`${dossier(value).base}/tmp`), false);
    });
});

test("Open, active и done допускают группу без status/result изменений", async (context) => {
  for (const category of ["open", "active", "done"])
    await context.test(category, (child) => {
      const value = fixture(child);
      if (category === "active") mutate(value, { category });
      if (category === "done") {
        publishWorkspaceResult(
          value.storage,
          value.key,
          managed(value).meta.revision,
          { summary: "Fixture result", artifacts: [], checks: [] },
        );
        mutate(value, { category });
      }
      const before = managed(value).meta;
      const group = begin(value);
      assert.equal(finish(value, group).status, "completed");
      assert.deepEqual(managed(value).meta.status, before.status);
      assert.deepEqual(managed(value).meta.result, before.result);
    });
});

test("Registration interruption сохраняет prepared trees и восстанавливает только неизменённые inode/bytes", async (context) => {
  for (const failure of [
    "empty",
    "written content",
    "new inode",
    "partial registered",
  ])
    await context.test(failure, (child) => {
      const value = fixture(child),
        base = dossier(value).base;
      const write = value.storage.write.bind(value.storage);
      value.storage.write = (...args) => {
        if (args[0] === `${base}/artifact-manifest.json`) {
          if (failure === "written content")
            value.storage.write(
              `${base}/${PATHS[2]}/writer.txt`,
              "writer fixture\n",
            );
          if (failure === "new inode") {
            fs.renameSync(
              path.join(value.root, base, PATHS[2]),
              path.join(value.root, base, "tmp/original"),
            );
            fs.mkdirSync(path.join(value.root, base, PATHS[2]));
            value.storage.write(
              `${base}/${PATHS[2]}/foreign.txt`,
              "foreign inode\n",
            );
          }
          if (failure === "partial registered") write(...args);
          throw new Error("injected registration failure");
        }
        return write(...args);
      };
      const caught = captureProducerFailure(() => begin(value));
      value.storage.write = write;
      assert.equal(caught.message, "injected registration failure");
      assert.equal(caught.operation.kind, "producer-begin");
      const pending = readPendingWorkspaceOperation(value.storage, value.key);
      assert.ok(pending);
      assert.equal(pending.operationId, caught.operation.operationId);
      for (const relative of PATHS)
        assert.ok(value.storage.exists(`${base}/${relative}`));
      const resume = () =>
        recoverWorkspaceOperation(
          value.storage,
          value.key,
          caught.operation.operationId,
          { "producer-begin": resumeWorkspaceProducerOperation },
        );
      if (failure === "written content" || failure === "new inode") {
        expectCode(
          resume,
          failure === "written content"
            ? "producer_directory_changed"
            : "directory_identity_changed",
        );
        const relative =
          failure === "written content" ? "writer.txt" : "foreign.txt";
        assert.equal(
          value.storage.read(`${base}/${PATHS[2]}/${relative}`).toString(),
          failure === "written content"
            ? "writer fixture\n"
            : "foreign inode\n",
        );
        assert.deepEqual(manifest(value).artifacts, []);
        if (failure === "new inode")
          assert.ok(value.storage.exists(`${base}/tmp/original`));
      } else {
        assert.equal(
          manifest(value).artifacts.length,
          failure === "partial registered" ? 3 : 0,
        );
        resume();
        assert.equal(manifest(value).artifacts.length, 3);
        assert.equal(managed(value).meta.revision, 2);
        assert.equal(
          readPendingWorkspaceOperation(value.storage, value.key),
          null,
        );
        for (const artifact of manifest(value).artifacts)
          assert.equal(artifact.producer.settled, false);
      }
    });
});

test("Concurrent TASK revision после mkdir оставляет pending и не переписывает чужие metadata", (context) => {
  const value = fixture(context),
    base = dossier(value).base;
  const withParent = value.storage.withParent.bind(value.storage);
  let injected = false;
  value.storage.withParent = (relative, create, callback) => {
    const result = withParent(relative, create, callback);
    if (!injected && relative === `${base}/${PATHS[2]}`) {
      injected = true;
      bumpRevision(value);
    }
    return result;
  };
  expectCode(() => begin(value), "metadata_state_conflict");
  value.storage.withParent = withParent;
  assert.equal(managed(value).meta.revision, 2);
  assert.deepEqual(manifest(value).artifacts, []);
  for (const relative of PATHS)
    assert.ok(value.storage.exists(`${base}/${relative}`));
  const pending = readPendingWorkspaceOperation(value.storage, value.key);
  assert.ok(pending);
  expectCode(
    () =>
      recoverWorkspaceOperation(value.storage, value.key, pending.operationId, {
        "producer-begin": resumeWorkspaceProducerOperation,
      }),
    "metadata_state_conflict",
  );
  assert.equal(managed(value).meta.revision, 2);
  assert.deepEqual(manifest(value).artifacts, []);
});

test("Concurrent revision/metadata/tree mutation после exact plan закрывает apply без удаления", async (context) => {
  for (const change of ["revision", "metadata", "tree"])
    await context.test(change, (child) => {
      const value = fixture(child),
        group = begin(value),
        base = dossier(value).base;
      output(value, group);
      const write = value.storage.write.bind(value.storage);
      value.storage.write = (...args) => {
        const result = write(...args);
        if (args[0].startsWith(`${base}/logs/cleanup-plans/`)) {
          if (change === "revision") bumpRevision(value);
          if (change === "metadata")
            changeManifest(value, (data) => {
              data.artifacts[2].stageId = "other-stage";
            });
          if (change === "tree")
            value.storage.write(
              `${base}/${PATHS[2]}/changed.txt`,
              "concurrent fixture\n",
            );
        }
        return result;
      };
      const summary = finish(value, group);
      value.storage.write = write;
      assert.equal(summary.status, "blocked");
      assert.equal(
        summary.reason,
        change === "revision"
          ? "cleanup_revision_conflict"
          : change === "metadata"
            ? "cleanup_revision_conflict"
            : "artifact_changed",
      );
      assert.ok(value.storage.exists(`${base}/${PATHS[2]}/generated.txt`));
      assert.equal(manifest(value).artifacts[2].state, "ready");
    });
});

test("Cleanup evidence не записывается внутрь уже settled registered log tree", (context) => {
  const value = fixture(context),
    group = begin(value, [
      { path: "logs/cleanup-results", category: "log" },
      { path: PATHS[2], category: "temporary" },
    ]);
  output(value, group);
  const summary = finish(value, group);
  assert.equal(summary.status, "blocked");
  assert.equal(summary.reason, "cleanup_evidence_registered");
  assert.deepEqual(
    value.storage.list(`${dossier(value).base}/logs/cleanup-results`),
    ["generated.txt"],
  );
  assert.equal(
    value.storage.exists(`${dossier(value).base}/logs/cleanup-plans`),
    false,
  );
});

test("V10: две группы одного досье независимо завершают собственные записи", (context) => {
  const value = fixture(context);
  const receipt = begin(value, [
    {
      path: "logs/lifecycle",
      category: "log",
      retention: {
        mode: "retain",
        pinned: true,
        keepReason: "Квитанция",
        referencedBy: [],
      },
    },
  ]);
  output(value, receipt, "lifecycle bytes\n");
  const ownReceipt = structuredClone(manifest(value).artifacts[0]);
  const main = begin(value);
  output(value, main);
  const mainResult = finish(value, main);
  assert.equal(mainResult.status, "completed");
  assert.deepEqual(
    manifest(value).artifacts.find(
      (artifact) => artifact.id === receipt.artifactIds[0],
    ),
    ownReceipt,
  );
  const receiptResult = finish(value, receipt, { cleanupTemporary: false });
  assert.equal(receiptResult.status, "completed");
  assert.equal(receiptResult.settlement, "settled");
  assert.equal(receiptResult.cleanup.status, "not_requested");
  const actual = manifest(value).artifacts.find(
    (artifact) => artifact.id === receipt.artifactIds[0],
  );
  assert.ok(actual);
  assert.equal(actual.producer.settled, true);
  assert.equal(actual.retention.pinned, true);
  assert.equal(actual.retention.mode, "retain");
  assert.equal(
    value.storage
      .read(`${dossier(value).base}/logs/lifecycle/generated.txt`)
      .toString(),
    "lifecycle bytes\n",
  );
  assert.deepEqual(finish(value, main), mainResult);
  assert.deepEqual(
    finish(value, receipt, { cleanupTemporary: false }),
    receiptResult,
  );
});

test("V10: cleanupfalse→true использует новую операцию и свежие retention без повторного settle", (context) => {
  const value = fixture(context),
    group = begin(value);
  output(value, group);
  const settled = finish(value, group, { cleanupTemporary: false });
  assert.equal(settled.status, "completed");
  assert.equal(settled.phase, "completed");
  assert.equal(settled.operation, null);
  const other = begin(value, [{ path: "logs/other-group", category: "log" }]);
  output(value, other, "foreign group\n");
  const othersBefore = manifest(value).artifacts.filter((artifact) =>
    other.artifactIds.includes(artifact.id),
  );
  changeManifest(value, (data) => {
    const artifact = data.artifacts.find(
      (artifact) => artifact.id === group.artifactIds[2],
    );
    assert.ok(artifact);
    artifact.retention.pinned = true;
  });
  const retained = finish(value, group);
  assert.equal(retained.status, "blocked");
  assert.equal(retained.reason, "artifact_retained");
  assert.equal(retained.settlement, "settled");
  assert.equal(retained.phase, "preflight");
  assert.equal(retained.operation, null);
  changeManifest(value, (data) => {
    const artifact = data.artifacts.find(
      (artifact) => artifact.id === group.artifactIds[2],
    );
    assert.ok(artifact);
    artifact.retention.pinned = false;
  });
  const cleaned = finish(value, group);
  assert.equal(cleaned.status, "completed");
  assert.equal(cleaned.cleanup.status, "completed");
  assert.ok(cleaned.cleanup.receipt.requestId);
  assert.ok(
    manifest(value)
      .artifacts.filter((artifact) => group.artifactIds.includes(artifact.id))
      .every((artifact) => artifact.revision === 2),
  );
  assert.deepEqual(
    manifest(value).artifacts.filter((artifact) =>
      other.artifactIds.includes(artifact.id),
    ),
    othersBefore,
  );
  assert.deepEqual(finish(value, group, { cleanupTemporary: false }), settled);
  assert.deepEqual(finish(value, group), cleaned);
});

test("V10: completed replay отвергает foreign own change и не принимает её в binding", (context) => {
  const value = fixture(context),
    group = begin(value);
  output(value, group);
  const completed = finish(value, group, { cleanupTemporary: false });
  assert.equal(completed.status, "completed");
  const original = manifest(value);
  changeManifest(value, (data) => {
    data.artifacts[0].stageId = "foreign-stage";
  });
  const changed = finish(value, group, { cleanupTemporary: false });
  assert.equal(changed.status, "blocked");
  assert.equal(changed.reason, "producer_group_metadata_changed");
  assert.equal(changed.settlement, "unknown");
  assert.equal(changed.operation, null);
  assert.equal(manifest(value).artifacts[0].stageId, "foreign-stage");
  value.storage.writeJson(
    `${dossier(value).base}/artifact-manifest.json`,
    original,
  );
  assert.deepEqual(
    finish(value, group, { cleanupTemporary: false }),
    completed,
  );
});
