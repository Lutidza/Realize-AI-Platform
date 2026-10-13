/**
 * @file .ai/tools/task-workspace/src/workspaceSafety.test.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Проверяет lifecycle, retention и восстановление локальных досье только на изолированных /tmp fixtures.
 * @see documentation/specifications/task-management-execution.md
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { WorkspaceFs } from "./WorkspaceFs.adapter.mjs";
import { createDossier } from "./createDossier.service.mjs";
import { updateDossier } from "./updateDossier.service.mjs";
import { publishWorkspaceResult } from "./publishWorkspaceResult.service.mjs";
import { registerWorkspaceArtifacts } from "./registerWorkspaceArtifact.service.mjs";
import { settleWorkspaceArtifacts } from "./settleWorkspaceArtifact.service.mjs";
import { planWorkspaceCleanup } from "./planWorkspaceCleanup.service.mjs";
import { applyWorkspaceCleanup } from "./applyWorkspaceCleanup.service.mjs";
import { moveDossier } from "./moveDossier.service.mjs";
import {
  readDossier,
  readArtifacts,
  writeDossier,
} from "./Dossier.repository.mjs";
import { hashBytes } from "./hashWorkspaceTree.adapter.mjs";
import { runtimeRoot } from "./withWorkspaceLock.adapter.mjs";

const KEY = "fixture-task";
const TITLE = "Изолированная проверка досье";
const BODY =
  "# Задание\n\nКритерий: результат и проверки относятся к текущей версии.\n";
const CHECK = "required-check";
const EVIDENCE = "logs/checks/required.txt";

function fixture(context) {
  const temporary = fs.mkdtempSync("/tmp/realize-workspace-safety-");
  const root = path.join(temporary, "root");
  fs.mkdirSync(root);
  const storage = new WorkspaceFs(root);
  context.after(() => {
    storage.close();
    assert.ok(temporary.startsWith("/tmp/realize-workspace-safety-"));
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  return { temporary, root, storage, key: KEY };
}

function dossier(value) {
  return readDossier(value.storage, value.key);
}

function manifest(value) {
  return readArtifacts(value.storage, dossier(value));
}

function create(value, options = {}) {
  return createDossier(value.storage, {
    key: value.key,
    title: TITLE,
    body: BODY,
    ...options,
  });
}

function mutate(value, input, expectedRevision = dossier(value).meta.revision) {
  return updateDossier(value.storage, value.key, expectedRevision, input);
}

function registration(relative, options = {}) {
  return {
    path: relative,
    category: "temporary",
    stageId: null,
    attemptId: null,
    producer: { id: "fixture-producer", pid: null, settled: true },
    retention: {
      mode: "temporary",
      pinned: false,
      keepReason: null,
      referencedBy: [],
    },
    ...options,
  };
}

function register(value, item) {
  const before = dossier(value).meta.revision;
  registerWorkspaceArtifacts(value.storage, value.key, before, {
    artifacts: [item],
  });
  return manifest(value).artifacts.find(
    (artifact) => artifact.path === item.path,
  );
}

function temporaryArtifact(value, options = {}) {
  const relative = "tmp/attempt-one";
  value.storage.write(
    `${dossier(value).base}/${relative}/output.txt`,
    "fixture temporary bytes\n",
  );
  return register(value, registration(relative, options));
}

function evidenceArtifact(value, options = {}) {
  value.storage.write(
    `${dossier(value).base}/${EVIDENCE}`,
    "passed fixture check\n",
  );
  return register(
    value,
    registration(EVIDENCE, {
      category: "log",
      retention: {
        mode: "retain",
        pinned: false,
        keepReason: null,
        referencedBy: [],
      },
      ...options,
    }),
  );
}

function artifactRef(artifact) {
  return { id: artifact.id, revision: artifact.revision, hash: artifact.hash };
}

function publish(value, options = {}) {
  const artifact = manifest(value).artifacts.find(
    (item) => item.path === EVIDENCE,
  );
  return publishWorkspaceResult(
    value.storage,
    value.key,
    dossier(value).meta.revision,
    {
      summary: "Проверенный fixture результат",
      artifacts: artifact ? [artifactRef(artifact)] : [],
      checks: [{ id: CHECK, status: "passed", evidence: EVIDENCE }],
      ...options,
    },
  );
}

function readyResult(value, options = {}) {
  create(value, { requiredChecks: [CHECK], ...options });
  evidenceArtifact(value);
  return publish(value);
}

function plan(value, selection) {
  return planWorkspaceCleanup(
    value.storage,
    value.key,
    dossier(value).meta.revision,
    selection,
  ).plan;
}

function expectCode(operation, code) {
  assert.throws(operation, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

test("Явный legacy adopt сохраняет точное тело, original hash и локальную идентичность", (context) => {
  const value = fixture(context);
  const original =
    "# Legacy\r\n\r\nСтатус: завершено?  \n<!-- сохранить -->\r\n";
  const base = `.ai-workspace/tasks/${value.key}`;
  value.storage.write(`${base}/TASK.md`, original);
  expectCode(
    () => mutate(value, { category: "active" }, 1),
    "legacy_requires_adoption",
  );
  assert.equal(value.storage.read(`${base}/TASK.md`).toString(), original);
  const meta = createDossier(
    value.storage,
    { key: value.key, title: TITLE, category: "active" },
    true,
  );
  assert.equal(dossier(value).body, original);
  assert.equal(meta.legacy.originalBodyHash, hashBytes(Buffer.from(original)));
  assert.equal(meta.status.category, "active");
  assert.equal(meta.outcome, null);
  assert.equal(meta.taskRef, null);
  assert.match(meta.localDossierId, /^[a-f0-9-]{36}$/);
  mutate(value, { category: "active" });
  assert.equal(dossier(value).body, original);
  expectCode(
    () => createDossier(value.storage, { key: value.key, title: TITLE }, true),
    "already_managed",
  );
});

test("Legacy history и предполагаемая приёмка не превращаются в подтверждённый статус", (context) => {
  const value = fixture(context);
  value.storage.write(
    `.ai-workspace/history/${value.key}/TASK.md`,
    "# Legacy accepted\n",
  );
  expectCode(
    () =>
      createDossier(
        value.storage,
        { key: value.key, title: TITLE, category: "active" },
        true,
      ),
    "legacy_archive_requires_review",
  );
  expectCode(
    () =>
      createDossier(
        value.storage,
        { key: value.key, title: TITLE, category: "done" },
        true,
      ),
    "invalid_adoption_category",
  );
  expectCode(() => create(value), "dossier_collision");
  assert.equal(
    value.storage.read(`.ai-workspace/history/${value.key}/TASK.md`).toString(),
    "# Legacy accepted\n",
  );
});

test("CAS требует revision и сохраняет внешнюю правку тела при document conflict", (context) => {
  const value = fixture(context);
  create(value);
  for (const expectedRevision of [undefined, null, 0, -1, "1"]) {
    expectCode(
      () =>
        updateDossier(value.storage, value.key, expectedRevision, {
          category: "active",
        }),
      "expected_revision_required",
    );
  }
  mutate(value, { category: "active" }, 1);
  expectCode(() => mutate(value, { category: "open" }, 1), "revision_conflict");
  const stale = dossier(value);
  const changed =
    value.storage.read(`${stale.base}/TASK.md`).toString() +
    "\nНовая внешняя правка.\n";
  value.storage.write(`${stale.base}/TASK.md`, changed);
  expectCode(
    () =>
      writeDossier(value.storage, stale, {
        ...stale.meta,
        revision: stale.meta.revision + 1,
      }),
    "document_conflict",
  );
  assert.equal(value.storage.read(`${stale.base}/TASK.md`).toString(), changed);
});

test("Done допускает ожидание приёмки, Closed требует текущую acceptance и delivery evidence", (context) => {
  const value = fixture(context);
  const submitted = readyResult(value, {
    acceptanceRequired: true,
    deliveryRequired: true,
  });
  const done = mutate(value, { category: "done" });
  assert.equal(done.outcome, null);
  assert.equal(done.acceptance.state, "pending");
  expectCode(
    () => mutate(value, { category: "closed" }),
    "acceptance_required",
  );
  const acceptance = {
    ...done.acceptance,
    state: "accepted",
    resultHash: submitted.result.hash,
    criteriaHash: dossier(value).bodyHash,
    decidedAt: new Date().toISOString(),
  };
  mutate(value, { acceptance });
  expectCode(() => mutate(value, { category: "closed" }), "delivery_required");
  const closed = mutate(value, {
    category: "closed",
    delivery: { required: true, state: "completed", evidence: [EVIDENCE] },
  });
  assert.equal(closed.status.category, "closed");
  assert.equal(closed.outcome, "succeeded");
  assert.ok(closed.closedAt);
  assert.equal(dossier(value).body, BODY);
  assert.deepEqual(manifest(value).artifacts[0].retention.referencedBy, [
    "result:1",
  ]);
  expectCode(() => mutate(value, { category: "active" }), "reopen_required");
});

test("Непройденный или отсутствующий required check не закрывает и не завершает задачу", async (context) => {
  for (const status of ["failed", "not_required", "missing"]) {
    await context.test(status, (child) => {
      const value = fixture(child);
      create(value, { requiredChecks: [CHECK] });
      evidenceArtifact(value);
      publish(value, {
        checks:
          status === "missing"
            ? []
            : [{ id: CHECK, status, evidence: EVIDENCE }],
      });
      const before = dossier(value).meta;
      expectCode(
        () => mutate(value, { category: "done" }),
        "required_check_failed",
      );
      expectCode(
        () => mutate(value, { category: "closed" }),
        "required_check_failed",
      );
      assert.deepEqual(dossier(value).meta, before);
    });
  }
});

test("Cancelled требует явную причину и quiescence, paused не становится task status", (context) => {
  const value = fixture(context);
  create(value, { acceptanceRequired: true });
  expectCode(
    () => mutate(value, { category: "closed", outcome: "cancelled" }),
    "cancellation_reason_required",
  );
  mutate(value, {
    execution: {
      state: "paused",
      runtimeRef: { owner: "fixture-runtime", id: "fixture-run" },
      stageId: null,
      attemptId: null,
    },
  });
  assert.equal(dossier(value).meta.status.category, "open");
  expectCode(
    () =>
      mutate(value, {
        category: "closed",
        outcome: "cancelled",
        cancellationReason: "Задание отменено владельцем.",
      }),
    "execution_not_quiescent",
  );
  mutate(value, {
    execution: {
      state: "cancelled",
      runtimeRef: { owner: "fixture-runtime", id: "fixture-run" },
      stageId: null,
      attemptId: null,
    },
  });
  const closed = mutate(value, {
    category: "closed",
    outcome: "cancelled",
    cancellationReason: "Задание отменено владельцем.",
  });
  assert.equal(closed.outcome, "cancelled");
  assert.notEqual(closed.acceptance.state, "accepted");
  assert.match(dossier(value).body, /Отмена: Задание отменено владельцем\./);
});

test("Result publication требует зарегистрированный retained evidence в собственных refs", (context) => {
  const value = fixture(context);
  create(value, { requiredChecks: [CHECK] });
  value.storage.write(
    `${dossier(value).base}/${EVIDENCE}`,
    "unregistered evidence\n",
  );
  expectCode(
    () => publish(value, { artifacts: [] }),
    "evidence_not_registered",
  );
  evidenceArtifact(value);
  expectCode(
    () => publish(value, { artifacts: [] }),
    "evidence_not_registered",
  );
  assert.equal(dossier(value).meta.result, null);
  publish(value);
  assert.equal(dossier(value).meta.result.revision, 1);
});

test("Unsettled producer запрещает publication; settle закрепляет свежую artifact revision", (context) => {
  const value = fixture(context);
  create(value, { requiredChecks: [CHECK] });
  const before = evidenceArtifact(value, {
    producer: { id: "fixture-producer", pid: null, settled: false },
  });
  expectCode(() => publish(value), "result_artifact_not_durable");
  value.storage.write(
    `${dossier(value).base}/${EVIDENCE}`,
    "settled final fixture bytes\n",
  );
  settleWorkspaceArtifacts(
    value.storage,
    value.key,
    dossier(value).meta.revision,
    { artifactIds: [before.id] },
  );
  const after = manifest(value).artifacts[0];
  assert.equal(after.producer.settled, true);
  assert.equal(after.revision, before.revision + 1);
  assert.notEqual(after.hash, before.hash);
  expectCode(
    () => publish(value, { artifacts: [artifactRef(before)], checks: [] }),
    "result_artifact_not_durable",
  );
  publish(value);
  expectCode(
    () =>
      settleWorkspaceArtifacts(
        value.storage,
        value.key,
        dossier(value).meta.revision,
        { artifactIds: [after.id] },
      ),
    "producer_already_settled",
  );
});

test("Result crash сохраняет immutable orphan и не блокирует новую publication", (context) => {
  const value = fixture(context);
  create(value, { requiredChecks: [CHECK] });
  evidenceArtifact(value);
  const base = dossier(value).base;
  const orphan = `${base}/logs/results/1.json`;
  const originalWrite = value.storage.write.bind(value.storage);
  value.storage.write = (...args) => {
    originalWrite(...args);
    if (args[0] === orphan)
      throw new Error("fixture crash after immutable result write");
  };
  assert.throws(
    () => publish(value, { summary: "Первый прерванный результат" }),
    /fixture crash after immutable result write/,
  );
  value.storage.write = originalWrite;
  const preserved = value.storage.read(orphan);
  assert.equal(dossier(value).meta.result, null);
  assert.equal(JSON.parse(preserved.toString()).revision, 1);
  const published = publish(value, { summary: "Новая успешная сдача" });
  assert.equal(published.result.revision, 2);
  assert.equal(published.result.path, "logs/results/2.json");
  assert.deepEqual(value.storage.read(orphan), preserved);
  assert.equal(
    hashBytes(value.storage.read(`${base}/${published.result.path}`)),
    published.result.hash,
  );
  assert.deepEqual(manifest(value).artifacts[0].retention.referencedBy, [
    "result:2",
  ]);
  assert.equal(mutate(value, { category: "done" }).status.category, "done");
});

test("Живой PID identity запрещает settle и публикацию даже при declared settled", (context) => {
  const value = fixture(context);
  create(value, { requiredChecks: [CHECK] });
  const artifact = evidenceArtifact(value, {
    producer: { id: "fixture-producer", pid: process.pid, settled: false },
  });
  assert.ok(artifact.producer.identity?.bootId);
  expectCode(
    () =>
      settleWorkspaceArtifacts(
        value.storage,
        value.key,
        dossier(value).meta.revision,
        { artifactIds: [artifact.id] },
      ),
    "producer_active",
  );
  const data = manifest(value);
  data.artifacts[0].producer.settled = true;
  value.storage.writeJson(
    `${dossier(value).base}/artifact-manifest.json`,
    data,
  );
  expectCode(() => publish(value), "result_artifact_not_durable");
});

test("Изменённые bytes результата, artifact и критерии отклоняют Done без metadata mutation", async (context) => {
  const changes = [
    [
      "result bytes",
      "result_changed",
      (value) =>
        value.storage.write(
          `${dossier(value).base}/${dossier(value).meta.result.path}`,
          "{}\n",
        ),
    ],
    [
      "artifact bytes",
      "result_artifact_changed",
      (value) =>
        value.storage.write(
          `${dossier(value).base}/${EVIDENCE}`,
          "different evidence bytes\n",
        ),
    ],
    [
      "criteria",
      "criteria_changed",
      (value) =>
        value.storage.write(
          `${dossier(value).base}/TASK.md`,
          value.storage.read(`${dossier(value).base}/TASK.md`).toString() +
            "\nНовый критерий.\n",
        ),
    ],
  ];
  for (const [name, code, change] of changes) {
    await context.test(name, (child) => {
      const value = fixture(child);
      readyResult(value);
      change(value);
      const before = dossier(value).meta;
      expectCode(() => mutate(value, { category: "done" }), code);
      assert.deepEqual(dossier(value).meta, before);
    });
  }
});

test("Evidence symlink внутри зарегистрированного дерева не считается файлом проверки", (context) => {
  const value = fixture(context);
  create(value);
  const outside = path.join(value.temporary, "external-evidence.txt");
  fs.writeFileSync(outside, "outside fixture sentinel\n");
  const base = dossier(value).base;
  value.storage.mkdir(`${base}/logs/evidence`);
  fs.symlinkSync(
    outside,
    path.join(value.root, base, "logs/evidence/check.txt"),
  );
  const artifact = register(
    value,
    registration("logs/evidence", {
      category: "log",
      retention: {
        mode: "retain",
        pinned: false,
        keepReason: null,
        referencedBy: [],
      },
    }),
  );
  expectCode(
    () =>
      publish(value, {
        artifacts: [artifactRef(artifact)],
        checks: [
          { id: CHECK, status: "passed", evidence: "logs/evidence/check.txt" },
        ],
      }),
    "evidence_file_required",
  );
  assert.equal(fs.readFileSync(outside, "utf8"), "outside fixture sentinel\n");
});

test("Cleanup отклоняет retention, references, unsettled producer и paused execution", async (context) => {
  const retention = {
    mode: "temporary",
    pinned: false,
    keepReason: null,
    referencedBy: [],
  };
  const cases = [
    [
      "retain",
      { retention: { ...retention, mode: "retain" } },
      "artifact_retained",
    ],
    [
      "pinned",
      { retention: { ...retention, pinned: true } },
      "artifact_retained",
    ],
    [
      "keepReason",
      { retention: { ...retention, keepReason: "Нужен для review" } },
      "artifact_retained",
    ],
    [
      "referencedBy",
      { retention: { ...retention, referencedBy: ["other-result:1"] } },
      "artifact_retained",
    ],
    [
      "unsettled",
      { producer: { id: "fixture-producer", pid: null, settled: false } },
      "artifact_retained",
    ],
    [
      "live PID",
      { producer: { id: "fixture-producer", pid: process.pid, settled: true } },
      "producer_active",
    ],
  ];
  for (const [name, options, code] of cases) {
    await context.test(name, (child) => {
      const value = fixture(child);
      create(value);
      temporaryArtifact(value, options);
      expectCode(() => plan(value), code);
      assert.ok(
        value.storage.exists(
          `${dossier(value).base}/tmp/attempt-one/output.txt`,
        ),
      );
    });
  }
  await context.test("paused", (child) => {
    const value = fixture(child);
    create(value);
    temporaryArtifact(value);
    mutate(value, {
      execution: {
        state: "paused",
        runtimeRef: null,
        stageId: null,
        attemptId: null,
      },
    });
    expectCode(() => plan(value), "execution_not_quiescent");
  });
});

test("Registration и selection отклоняют unregistered, parent/child overlaps и protected paths", (context) => {
  const value = fixture(context);
  create(value);
  value.storage.write(
    `${dossier(value).base}/tmp/unregistered/output.txt`,
    "unregistered\n",
  );
  expectCode(
    () => plan(value, ["tmp/unregistered"]),
    "selection_not_registered",
  );
  const artifact = temporaryArtifact(value);
  expectCode(
    () => register(value, registration(`${artifact.path}/output.txt`)),
    "artifact_already_registered",
  );
  expectCode(
    () => register(value, registration("tmp")),
    "protected_artifact_path",
  );
  for (const relative of ["../outside", "/tmp/outside", "tmp/../outside"]) {
    expectCode(() => register(value, registration(relative)), "unsafe_path");
  }
  for (const relative of ["tmp/.env", "tmp/token.key", "tmp/runtime.sqlite"]) {
    value.storage.write(
      `${dossier(value).base}/${relative}`,
      "fixture protected bytes\n",
    );
    expectCode(
      () => register(value, registration(relative)),
      "protected_artifact_path",
    );
  }
  assert.equal(manifest(value).artifacts.length, 1);
  expectCode(
    () =>
      registerWorkspaceArtifacts(
        value.storage,
        value.key,
        dossier(value).meta.revision,
        { artifacts: [registration("tmp/attempt-two")], unknown: true },
      ),
    "invalid_registration",
  );
});

test("Registration не включает nested env, dump и runtime store внутрь temporary tree", (context) => {
  const value = fixture(context);
  create(value);
  const base = dossier(value).base;
  for (const [index, filename] of [
    ".env.local",
    "archive.dump",
    "database.sqlite",
  ].entries()) {
    const relative = `tmp/protected-case-${index}`;
    value.storage.write(
      `${base}/${relative}/nested/${filename}`,
      "synthetic fixture data; no credentials\n",
    );
    expectCode(
      () => register(value, registration(relative)),
      "protected_artifact_path",
    );
    assert.equal(manifest(value).artifacts.length, 0);
    assert.equal(dossier(value).meta.revision, 1);
    assert.ok(value.storage.exists(`${base}/${relative}/nested/${filename}`));
  }
});

test("Active code consumer и чужой process cwd удерживают temporary artifact", async (context) => {
  const value = fixture(context);
  create(value);
  const artifact = temporaryArtifact(value);
  const absolute = path.join(value.root, dossier(value).base, artifact.path);
  value.storage.write(
    "src/consumer.mjs",
    `export const input = ${JSON.stringify(`${dossier(value).base}/${artifact.path}`)};\n`,
  );
  expectCode(() => plan(value), "source_reference_active");
  value.storage.unlink("src/consumer.mjs");
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    cwd: absolute,
    stdio: "ignore",
  });
  await once(child, "spawn");
  try {
    expectCode(() => plan(value), "process_reference_active");
  } finally {
    const stopped = once(child, "exit");
    child.kill("SIGTERM");
    await stopped;
  }
});

test("Root/parent symlinks отклоняются без чтения и удаления external targets", (context) => {
  const value = fixture(context);
  create(value);
  const outside = path.join(value.temporary, "outside");
  fs.mkdirSync(outside);
  fs.writeFileSync(
    path.join(outside, "valuable.txt"),
    "external fixture sentinel\n",
  );
  const base = dossier(value).base;
  value.storage.mkdir(`${base}/tmp`);
  fs.symlinkSync(
    path.join(outside, "valuable.txt"),
    path.join(value.root, base, "tmp/root-link"),
  );
  expectCode(
    () => register(value, registration("tmp/root-link")),
    "symlink_root",
  );
  fs.symlinkSync(
    outside,
    path.join(value.root, base, "tmp/parent-link"),
    "dir",
  );
  expectCode(
    () => register(value, registration("tmp/parent-link/valuable.txt")),
    "symlink_parent",
  );
  assert.equal(
    fs.readFileSync(path.join(outside, "valuable.txt"), "utf8"),
    "external fixture sentinel\n",
  );
});

test("Anchored parent FD не следует новой symlink после замены pathname", (context) => {
  const value = fixture(context);
  value.storage.write("bucket/data.txt", "anchored fixture bytes\n");
  const outside = path.join(value.temporary, "outside");
  fs.mkdirSync(outside);
  fs.writeFileSync(
    path.join(outside, "data.txt"),
    "external fixture sentinel\n",
  );
  value.storage.withParent("bucket/data.txt", false, (anchored) => {
    fs.renameSync(
      path.join(value.root, "bucket"),
      path.join(value.root, "original-bucket"),
    );
    fs.symlinkSync(outside, path.join(value.root, "bucket"), "dir");
    assert.equal(fs.readFileSync(anchored, "utf8"), "anchored fixture bytes\n");
  });
  expectCode(() => value.storage.read("bucket/data.txt"), "symlink_parent");
  assert.equal(
    fs.readFileSync(path.join(outside, "data.txt"), "utf8"),
    "external fixture sentinel\n",
  );
});

test("Exact cleanup удаляет только fixture tree, сохраняет leaf targets и повторяется идемпотентно", (context) => {
  const value = fixture(context);
  create(value);
  const base = dossier(value).base;
  const outside = path.join(value.temporary, "external.txt");
  fs.writeFileSync(outside, "external fixture sentinel\n");
  value.storage.write(`${base}/tmp/attempt-one/output.txt`, "fixture output\n");
  fs.symlinkSync(
    outside,
    path.join(value.root, base, "tmp/attempt-one/external-link"),
  );
  fs.linkSync(
    outside,
    path.join(value.root, base, "tmp/attempt-one/external-hardlink"),
  );
  const artifact = register(value, registration("tmp/attempt-one"));
  const cleanup = plan(value);
  const before = dossier(value).meta.revision;
  const result = applyWorkspaceCleanup(value.storage, cleanup);
  assert.equal(result.status, "completed");
  assert.equal(value.storage.exists(`${base}/${artifact.path}`), false);
  assert.equal(fs.readFileSync(outside, "utf8"), "external fixture sentinel\n");
  assert.equal(manifest(value).artifacts[0].state, "deleted");
  assert.equal(dossier(value).meta.revision, before + 1);
  assert.deepEqual(applyWorkspaceCleanup(value.storage, cleanup), result);
  assert.equal(dossier(value).meta.revision, before + 1);
});

test("Cleanup plan повторно проверяет task/body/manifest revision и selected bytes", async (context) => {
  const cases = [
    [
      "task revision",
      "cleanup_revision_conflict",
      (value) => mutate(value, { category: "active" }),
    ],
    [
      "body",
      "cleanup_revision_conflict",
      (value) =>
        value.storage.write(
          `${dossier(value).base}/TASK.md`,
          value.storage.read(`${dossier(value).base}/TASK.md`).toString() +
            "\nИзменение тела.\n",
        ),
    ],
    [
      "manifest revision",
      "cleanup_revision_conflict",
      (value) => {
        const data = manifest(value);
        data.revision++;
        value.storage.writeJson(
          `${dossier(value).base}/artifact-manifest.json`,
          data,
        );
      },
    ],
    [
      "bytes",
      "artifact_changed",
      (value) =>
        value.storage.write(
          `${dossier(value).base}/tmp/attempt-one/output.txt`,
          "fresh different bytes\n",
        ),
    ],
  ];
  for (const [name, code, change] of cases) {
    await context.test(name, (child) => {
      const value = fixture(child);
      create(value);
      temporaryArtifact(value);
      const cleanup = plan(value);
      change(value);
      expectCode(() => applyWorkspaceCleanup(value.storage, cleanup), code);
      assert.ok(
        value.storage.exists(
          `${dossier(value).base}/tmp/attempt-one/output.txt`,
        ),
      );
    });
  }
});

test("Fresh consumer после beforeRename блокирует перенос и повторный apply", (context) => {
  const value = fixture(context);
  create(value);
  const artifact = temporaryArtifact(value);
  const base = dossier(value).base;
  const cleanup = plan(value);
  const consumer = `export const input = ${JSON.stringify(`${base}/${artifact.path}`)};\n`;
  expectCode(
    () =>
      applyWorkspaceCleanup(value.storage, cleanup, {
        hook: (phase) => {
          if (phase === "beforeRename")
            value.storage.write("src/fresh-consumer.mjs", consumer);
        },
      }),
    "source_reference_active",
  );
  assert.ok(value.storage.exists(`${base}/${artifact.path}/output.txt`));
  expectCode(
    () => applyWorkspaceCleanup(value.storage, cleanup),
    "source_reference_active",
  );
  value.storage.unlink("src/fresh-consumer.mjs");
  assert.equal(
    applyWorkspaceCleanup(value.storage, cleanup).status,
    "completed",
  );
});

test("Fresh consumer после beforePurge сохраняет quarantine до удаления ссылки", (context) => {
  const value = fixture(context);
  create(value);
  const artifact = temporaryArtifact(value);
  const base = dossier(value).base;
  const cleanup = plan(value);
  const quarantine = `${runtimeRoot}/quarantine/${cleanup.requestId}/${artifact.id}`;
  expectCode(
    () =>
      applyWorkspaceCleanup(value.storage, cleanup, {
        hook: (phase) => {
          if (phase === "beforePurge")
            value.storage.write(
              "src/fresh-consumer.mjs",
              `export const input = ${JSON.stringify(`${base}/${artifact.path}`)};\n`,
            );
        },
      }),
    "source_reference_active",
  );
  assert.ok(value.storage.exists(`${quarantine}/output.txt`));
  assert.equal(manifest(value).artifacts[0].state, "ready");
  expectCode(
    () => applyWorkspaceCleanup(value.storage, cleanup),
    "source_reference_active",
  );
  value.storage.unlink("src/fresh-consumer.mjs");
  assert.equal(
    applyWorkspaceCleanup(value.storage, cleanup).status,
    "completed",
  );
  assert.equal(value.storage.exists(quarantine), false);
});

test("Crash сразу после actual rename восстанавливается, проверяя появившиеся consumers", (context) => {
  const value = fixture(context);
  create(value);
  const artifact = temporaryArtifact(value);
  const base = dossier(value).base;
  const cleanup = plan(value);
  const quarantine = `${runtimeRoot}/quarantine/${cleanup.requestId}/${artifact.id}`;
  const originalRename = value.storage.renameNoReplace.bind(value.storage);
  value.storage.renameNoReplace = (...args) => {
    originalRename(...args);
    throw new Error("fixture crash after actual rename");
  };
  assert.throws(
    () => applyWorkspaceCleanup(value.storage, cleanup),
    /fixture crash after actual rename/,
  );
  value.storage.renameNoReplace = originalRename;
  assert.equal(value.storage.exists(`${base}/${artifact.path}`), false);
  assert.ok(value.storage.exists(`${quarantine}/output.txt`));
  value.storage.write(
    "src/recovery-consumer.mjs",
    `export const input = ${JSON.stringify(`${base}/${artifact.path}`)};\n`,
  );
  expectCode(
    () => applyWorkspaceCleanup(value.storage, cleanup),
    "source_reference_active",
  );
  assert.ok(value.storage.exists(`${quarantine}/output.txt`));
  value.storage.unlink("src/recovery-consumer.mjs");
  const result = applyWorkspaceCleanup(value.storage, cleanup);
  assert.equal(result.status, "completed");
  assert.deepEqual(applyWorkspaceCleanup(value.storage, cleanup), result);
});

test("Изменённое quarantine не удаляется и не публикуется как completed", (context) => {
  const value = fixture(context);
  create(value);
  const artifact = temporaryArtifact(value);
  const cleanup = plan(value);
  const quarantine = `${runtimeRoot}/quarantine/${cleanup.requestId}/${artifact.id}`;
  const before = dossier(value).meta.revision;
  assert.throws(
    () =>
      applyWorkspaceCleanup(value.storage, cleanup, {
        hook: (phase) => {
          if (phase === "afterQuarantine")
            throw new Error("fixture quarantine interruption");
        },
      }),
    /fixture quarantine interruption/,
  );
  value.storage.write(
    `${quarantine}/output.txt`,
    "changed quarantine fixture\n",
  );
  expectCode(
    () => applyWorkspaceCleanup(value.storage, cleanup),
    "quarantine_changed",
  );
  assert.equal(
    value.storage.read(`${quarantine}/output.txt`).toString(),
    "changed quarantine fixture\n",
  );
  assert.equal(dossier(value).meta.revision, before);
  assert.equal(manifest(value).artifacts[0].state, "ready");
});

test("Archive/reopen сохраняют ID, relative evidence refs и историю приёмки без overwrite", (context) => {
  const value = fixture(context);
  readyResult(value, { acceptanceRequired: true });
  const current = dossier(value);
  const body = current.body + `\n[Evidence](${EVIDENCE})\n`;
  value.storage.write(
    `${current.base}/TASK.md`,
    value.storage
      .read(`${current.base}/TASK.md`)
      .toString()
      .slice(0, -current.body.length) + body,
  );
  publish(value);
  const submitted = dossier(value);
  const acceptance = {
    ...submitted.meta.acceptance,
    state: "accepted",
    resultHash: submitted.meta.result.hash,
    criteriaHash: submitted.bodyHash,
    decidedAt: new Date().toISOString(),
  };
  const closed = mutate(value, { category: "closed", acceptance });
  const beforeResult = value.storage.read(
    `${dossier(value).base}/${closed.result.path}`,
  );
  const beforeManifest = manifest(value);
  const archived = moveDossier(value.storage, value.key, closed.revision);
  assert.equal(dossier(value).base, `.ai-workspace/history/${value.key}`);
  assert.equal(archived.localDossierId, closed.localDossierId);
  assert.equal(archived.outcome, "succeeded");
  assert.ok(archived.archivedAt);
  assert.deepEqual(manifest(value), beforeManifest);
  assert.equal(dossier(value).body, body);
  assert.deepEqual(
    value.storage.read(`${dossier(value).base}/${closed.result.path}`),
    beforeResult,
  );
  assert.ok(value.storage.exists(`${dossier(value).base}/${EVIDENCE}`));
  assert.deepEqual(
    moveDossier(value.storage, value.key, closed.revision),
    archived,
  );
  const reopened = moveDossier(
    value.storage,
    value.key,
    archived.revision,
    true,
  );
  assert.equal(dossier(value).base, `.ai-workspace/tasks/${value.key}`);
  assert.equal(reopened.status.category, "active");
  assert.equal(reopened.outcome, null);
  assert.equal(reopened.archivedAt, null);
  assert.equal(reopened.acceptance.state, "pending");
  assert.equal(reopened.localDossierId, closed.localDossierId);
  assert.deepEqual(manifest(value), beforeManifest);
  const journal = value.storage.json(
    `${runtimeRoot}/operations/${value.key}-reopen-${archived.revision}.json`,
  );
  assert.deepEqual(journal.before.acceptance, acceptance);
  assert.deepEqual(
    moveDossier(value.storage, value.key, archived.revision, true),
    reopened,
  );
  expectCode(
    () => moveDossier(value.storage, value.key, closed.revision),
    "revision_conflict",
  );
});

test("Archive/reopen destination collisions сохраняют оба досье и sentinels", (context) => {
  const value = fixture(context);
  create(value);
  const closed = mutate(value, {
    category: "closed",
    outcome: "cancelled",
    cancellationReason: "Fixture отменён.",
  });
  const history = `.ai-workspace/history/${value.key}`;
  value.storage.write(`${history}/sentinel.txt`, "history fixture sentinel\n");
  expectCode(
    () => moveDossier(value.storage, value.key, closed.revision),
    "dossier_collision",
  );
  assert.equal(
    value.storage.read(`${history}/sentinel.txt`).toString(),
    "history fixture sentinel\n",
  );
  assert.ok(value.storage.exists(`.ai-workspace/tasks/${value.key}/TASK.md`));
  value.storage.unlink(`${history}/sentinel.txt`);
  fs.rmdirSync(path.join(value.root, history));
  const archived = moveDossier(value.storage, value.key, closed.revision);
  const tasks = `.ai-workspace/tasks/${value.key}`;
  value.storage.write(`${tasks}/sentinel.txt`, "tasks fixture sentinel\n");
  expectCode(
    () => moveDossier(value.storage, value.key, archived.revision, true),
    "dossier_collision",
  );
  assert.equal(
    value.storage.read(`${tasks}/sentinel.txt`).toString(),
    "tasks fixture sentinel\n",
  );
  assert.ok(value.storage.exists(`${history}/TASK.md`));
});

test("Archive блокирует external code consumer и полный old-base ref внутри собственного TASK", (context) => {
  const value = fixture(context);
  const ownReference = `.ai-workspace/tasks/${value.key}/logs/needed.txt`;
  create(value, {
    body: BODY + `\n[Полная локальная ссылка](${ownReference})\n`,
  });
  const closed = mutate(value, {
    category: "closed",
    outcome: "cancelled",
    cancellationReason: "Fixture отменён.",
  });
  value.storage.write(
    "src/consumer.mjs",
    `export const task = ${JSON.stringify(`.ai-workspace/tasks/${value.key}`)};\n`,
  );
  expectCode(
    () => moveDossier(value.storage, value.key, closed.revision),
    "dossier_consumer_active",
  );
  value.storage.unlink("src/consumer.mjs");
  expectCode(
    () => moveDossier(value.storage, value.key, closed.revision),
    "dossier_consumer_active",
  );
  assert.ok(value.storage.exists(`.ai-workspace/tasks/${value.key}/TASK.md`));
  assert.equal(
    value.storage.exists(`.ai-workspace/history/${value.key}/TASK.md`),
    false,
  );
});
