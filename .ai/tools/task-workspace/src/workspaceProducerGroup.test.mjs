/**
 * @file .ai/tools/task-workspace/src/workspaceProducerGroup.test.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Проверяет exact producer-group lifecycle, consumer guards и безопасный rollback на собственных /tmp fixtures.
 * @see documentation/specifications/task-management-execution.md
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { WorkspaceFs } from "./WorkspaceFs.adapter.mjs";
import { createDossier } from "./createDossier.service.mjs";
import { updateDossier } from "./updateDossier.service.mjs";
import { publishWorkspaceResult } from "./publishWorkspaceResult.service.mjs";
import { moveDossier } from "./moveDossier.service.mjs";
import {
  readDossier,
  readArtifacts,
  writeDossier,
  writeArtifacts,
} from "./Dossier.repository.mjs";
import { snapshotTree } from "./hashWorkspaceTree.adapter.mjs";
import {
  beginWorkspaceProducerGroup,
  finalizeWorkspaceProducerGroup,
} from "./workspaceProducerGroup.service.mjs";

const KEY = "producer-fixture";
const STAGE = "fixture-browser";
const PATHS = [
  "logs/task-browser-cafe",
  "screenshots/task-browser-cafe",
  "tmp/task-browser-cafe",
];

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

function dossier(value) {
  return readDossier(value.storage, value.key);
}
function manifest(value) {
  return readArtifacts(value.storage, dossier(value));
}
function input(artifacts) {
  return {
    stageId: STAGE,
    attemptId: randomUUID(),
    artifacts:
      artifacts ??
      PATHS.map((relative, index) => ({
        path: relative,
        category: ["log", "screenshot", "temporary"][index],
      })),
  };
}
function begin(value, artifacts) {
  return beginWorkspaceProducerGroup(
    value.storage,
    value.key,
    input(artifacts),
  );
}
function finish(value, group, overrides = {}) {
  return finalizeWorkspaceProducerGroup(value.storage, group, {
    quiescent: true,
    cleanupTemporary: true,
    ...overrides,
  });
}
function output(value, group, text = "fixture bytes\n") {
  for (const relative of group.paths)
    value.storage.write(
      `${dossier(value).base}/${relative}/generated.txt`,
      text,
    );
}
function mutate(value, update) {
  const current = dossier(value);
  return updateDossier(value.storage, value.key, current.meta.revision, update);
}
function changeManifest(value, operation) {
  const current = dossier(value),
    data = manifest(value);
  operation(data);
  writeArtifacts(value.storage, current, data);
}
function bumpRevision(value) {
  const current = dossier(value);
  writeDossier(value.storage, current, {
    ...current.meta,
    revision: current.meta.revision + 1,
  });
}
function expectCode(operation, code) {
  assert.throws(operation, (error) => {
    assert.equal(error.code, code);
    return true;
  });
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
        const beforeTask = dossier(value);
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
          assert.equal(error.message, "expected caller failure");
        } finally {
          summary = finish(value, group);
        }
        assert.equal(summary.status, "completed");
        assert.equal(summary.cleanup.status, "completed");
        assert.deepEqual(summary.cleanup.paths, [PATHS[2]]);
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
          assert.notEqual(
            artifact.hash,
            initial.artifacts.find((item) => item.id === artifact.id).hash,
          );
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
        assert.deepEqual(dossier(value).meta.status, beforeTask.meta.status);
        assert.equal(dossier(value).meta.result, null);
        assert.equal(dossier(value).meta.archivedAt, null);
      },
    );
});

test("quiescent:false сохраняет все trees и unsettled metadata без revision mutation", (context) => {
  const value = fixture(context),
    group = begin(value);
  output(value, group);
  const task = dossier(value).meta,
    artifacts = manifest(value);
  const summary = finish(value, group, { quiescent: false });
  assert.equal(summary.status, "blocked");
  assert.equal(summary.reason, "producer_group_not_quiescent");
  assert.deepEqual(dossier(value).meta, task);
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

test("Retain, pin, keepReason и consumer references блокируют очистку после settle", async (context) => {
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
      const summary = finish(value, group);
      assert.equal(summary.status, "blocked");
      assert.equal(summary.cleanup.reason, "artifact_retained");
      assert.equal(manifest(value).artifacts[2].producer.settled, true);
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
  assert.deepEqual(dossier(value).meta.execution, execution);
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
        beforeTask = dossier(value).meta;
      const summary = finish(value, group);
      assert.equal(summary.status, "blocked");
      assert.equal(summary.reason, "producer_group_metadata_changed");
      assert.deepEqual(manifest(value), before);
      assert.deepEqual(dossier(value).meta, beforeTask);
      assert.ok(value.storage.exists(`${dossier(value).base}/${PATHS[2]}`));
    });
  await context.test("owner", (child) => {
    const value = fixture(child),
      group = begin(value),
      current = dossier(value),
      owner = randomUUID();
    writeDossier(value.storage, current, {
      ...current.meta,
      localDossierId: owner,
    });
    const summary = finish(value, group);
    assert.equal(summary.reason, "producer_group_owner_mismatch");
  });
  await context.test("unbound clone", (child) => {
    const value = fixture(child),
      group = begin(value);
    assert.equal(
      finish(value, structuredClone(group)).reason,
      "producer_group_unbound",
    );
  });
});

test("Exclusive collision сохраняет preexisting paths и откатывает только собственные пустые parents", (context) => {
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
        linked === "parent" ? "symlink_parent" : "producer_path_exists",
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
          dossier(value).meta.revision,
          { summary: "Fixture result", artifacts: [], checks: [] },
        );
        mutate(value, { category });
      }
      const before = dossier(value).meta;
      const group = begin(value);
      assert.equal(finish(value, group).status, "completed");
      assert.deepEqual(dossier(value).meta.status, before.status);
      assert.deepEqual(dossier(value).meta.result, before.result);
    });
});

test("Registration failure откатывает empty trees, но сохраняет content/new inode и partial registered manifest", async (context) => {
  for (const failure of [
    "empty",
    "written content",
    "new inode",
    "partial registered",
  ])
    await context.test(failure, (child) => {
      const value = fixture(child),
        base = dossier(value).base;
      const write = value.storage.writeJson.bind(value.storage);
      value.storage.writeJson = (...args) => {
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
          }
          if (failure === "partial registered") write(...args);
          throw new Error("injected registration failure");
        }
        return write(...args);
      };
      let caught;
      try {
        begin(value);
      } catch (error) {
        caught = error;
      }
      value.storage.writeJson = write;
      assert.equal(caught.message, "injected registration failure");
      if (failure === "empty") {
        for (const relative of PATHS)
          assert.equal(value.storage.exists(`${base}/${relative}`), false);
        assert.deepEqual(caught.rollback.preserved, []);
      } else {
        assert.ok(value.storage.exists(`${base}/${PATHS[2]}`));
        assert.ok(caught.rollback.preserved.length > 0);
        if (failure === "written content")
          assert.equal(
            value.storage.read(`${base}/${PATHS[2]}/writer.txt`).toString(),
            "writer fixture\n",
          );
        if (failure === "partial registered")
          assert.equal(manifest(value).artifacts.length, 3);
      }
    });
});

test("Concurrent TASK revision между созданием directories и register отклоняется с empty rollback", (context) => {
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
  expectCode(() => begin(value), "revision_conflict");
  value.storage.withParent = withParent;
  assert.equal(dossier(value).meta.revision, 2);
  assert.deepEqual(manifest(value).artifacts, []);
  for (const relative of PATHS)
    assert.equal(value.storage.exists(`${base}/${relative}`), false);
});

test("Concurrent revision/metadata/tree mutation после exact plan закрывает apply без удаления", async (context) => {
  for (const change of ["revision", "metadata", "tree"])
    await context.test(change, (child) => {
      const value = fixture(child),
        group = begin(value),
        base = dossier(value).base;
      output(value, group);
      const write = value.storage.writeJson.bind(value.storage);
      value.storage.writeJson = (...args) => {
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
      value.storage.writeJson = write;
      assert.equal(summary.status, "blocked");
      assert.equal(
        summary.reason,
        change === "revision"
          ? "cleanup_revision_conflict"
          : change === "metadata"
            ? "producer_group_metadata_changed"
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
