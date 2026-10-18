/**
 * @file .ai/tools/task-workspace/test/workspaceSafety.test.mjs
 * @version 1.0.5
 * @date 2026-10-16
 * @description Проверяет lifecycle, retention и восстановление локальных досье только на изолированных /tmp fixtures.
 * @see documentation/specifications/task-management-execution.md
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import { spawn } from "node:child_process";
import {
  workspaceTaskSchema,
  workspaceResultSchema,
} from "@realize/payload-task-manager/workspace-contracts";
import { WorkspaceFs } from "../src/filesystem/WorkspaceFs.adapter.mjs";
import { safeRelative } from "../src/filesystem/safeRelative.validator.mjs";
import {
  assertResult,
  assertClosed,
  assertResultPointer,
} from "../src/dossier/assertDossierLifecycle.validator.mjs";
import { createDossier } from "../src/dossier/createDossier.service.mjs";
import { updateDossier } from "../src/dossier/updateDossier.service.mjs";
import { publishWorkspaceResult } from "../src/artifacts/publishWorkspaceResult.service.mjs";
import { registerWorkspaceArtifacts } from "../src/artifacts/registerWorkspaceArtifacts.service.mjs";
import { settleWorkspaceArtifacts } from "../src/artifacts/settleWorkspaceArtifacts.service.mjs";
import { planWorkspaceCleanup } from "../src/cleanup/planWorkspaceCleanup.service.mjs";
import { applyWorkspaceCleanup } from "../src/cleanup/applyWorkspaceCleanup.service.mjs";
import { moveDossier } from "../src/dossier/moveDossier.service.mjs";
import {
  readDossier,
  readArtifacts,
  planDossierMetadata,
  prepareDossierInitialization,
} from "../src/dossier/Dossier.repository.mjs";
import {
  hashBytes,
  canonicalHash,
} from "../src/filesystem/canonicalHash.util.mjs";
import { recoverWorkspaceTaskOperation } from "../src/cli/workspaceRecoveryHandlers.config.mjs";
import {
  readWorkspaceOperationState,
  readCompletedWorkspaceOperation,
  isWorkspaceRecord,
} from "../src/recovery/WorkspaceOperation.repository.mjs";
import { runtimeRoot } from "../src/workspacePaths.config.mjs";

import { matchWorkspaceReferences } from "../src/consumers/matchWorkspaceReferences.util.mjs";
import { readWorkspaceReferences } from "../src/consumers/readWorkspaceReferences.adapter.mjs";
import { workspaceReferenceScope } from "../src/consumers/workspaceReferenceScope.config.mjs";

const KEY = "fixture-task";
const TITLE = "Изолированная проверка досье";
const BODY =
  "# Задание\n\nКритерий: результат и проверки относятся к текущей версии.\n";
const CHECK = "required-check";
const EVIDENCE = "logs/checks/required.txt";

/** @typedef {ReturnType<typeof fixture>} SafetyFixture */
/** @typedef {import('../src/artifacts/WorkspaceArtifacts.types').WorkspaceArtifactRegistration} ArtifactRegistration */
/** @typedef {Partial<import('../src/dossier/Dossier.types').CreateWorkspaceDossierInput>} CreateOptions */
/** @typedef {import('@realize/payload-task-manager/workspace-contracts').WorkspaceArtifactManifest} ArtifactManifest */

/** @param {import('node:test').TestContext} context */
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

/** @param {SafetyFixture} value */
function dossier(value) {
  const current = readDossier(value.storage, value.key);
  assert.ok(current.meta, "Fixture должен содержать managed metadata");
  return { ...current, meta: current.meta };
}

/** @param {SafetyFixture} value */
function manifest(value) {
  return readArtifacts(value.storage, dossier(value));
}

/** @param {SafetyFixture} value */
function resultPointer(value) {
  const pointer = dossier(value).meta.result;
  assert.ok(pointer, "Fixture должен содержать опубликованный результат");
  return pointer;
}

/** @param {SafetyFixture} value @param {CreateOptions} [options] */
function create(value, options = {}) {
  return createDossier(value.storage, {
    key: value.key,
    title: TITLE,
    body: BODY,
    ...options,
  });
}

/** @param {SafetyFixture} value @param {unknown} input @param {number} [expectedRevision] */
function mutate(value, input, expectedRevision = dossier(value).meta.revision) {
  return updateDossier(value.storage, value.key, expectedRevision, input);
}

/** @param {string} relative @param {Partial<ArtifactRegistration>} [options] @returns {ArtifactRegistration} */
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

/** @param {SafetyFixture} value @param {ArtifactRegistration} item */
function register(value, item) {
  const before = dossier(value).meta.revision;
  registerWorkspaceArtifacts(value.storage, value.key, before, {
    artifacts: [item],
  });
  const artifact = manifest(value).artifacts.find(
    (artifact) => artifact.path === item.path,
  );
  assert.ok(artifact, "Регистрация должна сохранить выбранный артефакт");
  return artifact;
}

/** @param {SafetyFixture} value @param {Partial<ArtifactRegistration>} [options] */
function temporaryArtifact(value, options = {}) {
  const relative = "tmp/attempt-one";
  value.storage.write(
    `${dossier(value).base}/${relative}/output.txt`,
    "fixture temporary bytes\n",
  );
  return register(value, registration(relative, options));
}

/** @param {SafetyFixture} value @param {Partial<ArtifactRegistration>} [options] */
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

/** @param {import('@realize/payload-task-manager/workspace-contracts').WorkspaceArtifact} artifact */
function artifactRef(artifact) {
  return { id: artifact.id, revision: artifact.revision, hash: artifact.hash };
}

/** @param {SafetyFixture} value @param {Partial<import('../src/artifacts/WorkspaceEvidence.types').PublishWorkspaceResultInput>} [options] */
function publish(value, options = {}) {
  const artifact = manifest(value).artifacts.find(
    (item) => item.path === EVIDENCE,
  );
  const published = publishWorkspaceResult(
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
  assert.ok(
    published.result,
    "Публикация должна сохранить указатель результата",
  );
  return { ...published, result: published.result };
}

/** @param {SafetyFixture} value @param {CreateOptions} [options] */
function readyResult(value, options = {}) {
  create(value, { requiredChecks: [CHECK], ...options });
  evidenceArtifact(value);
  return publish(value);
}

/** @param {SafetyFixture} value @param {string[]} [selection] */
function plan(value, selection) {
  return planWorkspaceCleanup(
    value.storage,
    value.key,
    dossier(value).meta.revision,
    selection,
  ).plan;
}

/** @param {() => unknown} operation @param {string} code */
function expectCode(operation, code) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof Error && "code" in error);
    assert.equal(error.code, code);
    return true;
  });
}

/** Снимок сохраняет пути и bytes только собственного fixture, не следуя symlink.
 * @param {SafetyFixture} value
 */
function workspaceFiles(value) {
  const root = path.join(value.root, ".ai-workspace");
  if (!fs.existsSync(root)) return null;
  return fs
    .readdirSync(root, { recursive: true, encoding: "utf8" })
    .sort()
    .map((relative) => {
      const file = path.join(root, relative);
      const stat = fs.lstatSync(file);
      return {
        path: relative,
        mode: stat.mode,
        inode: stat.ino,
        contents: stat.isSymbolicLink()
          ? fs.readlinkSync(file)
          : stat.isFile()
            ? fs.readFileSync(file)
            : null,
      };
    });
}

test("F02: create инициализирует manifest и русские разделы TEMPLATE-TASK", (context) => {
  const value = fixture(context);
  const created = create(value, { body: undefined });
  const template = fs.readFileSync(
    new URL(
      "../../../templates/task-workspace/TEMPLATE-TASK.md",
      import.meta.url,
    ),
    "utf8",
  );
  const templateBlock = template.match(/```markdown\n([\s\S]*?)\n```/);
  assert.ok(templateBlock, "Шаблон должен содержать markdown-блок");
  const expected = templateBlock[1];
  assert.deepEqual(
    dossier(value).body.match(/^## .+$/gm),
    expected.match(/^## .+$/gm),
  );
  assert.deepEqual(manifest(value), {
    schemaVersion: 1,
    localDossierId: created.localDossierId,
    revision: 1,
    artifacts: [],
  });
  const before = workspaceFiles(value);
  expectCode(() => create(value), "dossier_collision");
  assert.deepEqual(workspaceFiles(value), before);
});

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
  const before = workspaceFiles(value);
  expectCode(
    () => createDossier(value.storage, { key: value.key, title: TITLE }, true),
    "invalid_adoption_category",
  );
  assert.deepEqual(workspaceFiles(value), before);
  const meta = createDossier(
    value.storage,
    { key: value.key, title: TITLE, category: "active" },
    true,
  );
  assert.equal(dossier(value).body, original);
  assert.ok(meta.legacy);
  assert.equal(meta.legacy.originalBodyHash, hashBytes(Buffer.from(original)));
  assert.equal(meta.status.category, "active");
  assert.equal(meta.outcome, null);
  assert.equal(meta.taskRef, null);
  assert.match(meta.localDossierId, /^[a-f0-9-]{36}$/);
  mutate(value, { category: "active" });
  assert.equal(dossier(value).body, original);
  const after = workspaceFiles(value);
  assert.deepEqual(
    createDossier(
      value.storage,
      { key: value.key, title: TITLE, category: "active" },
      true,
    ),
    meta,
  );
  assert.deepEqual(workspaceFiles(value), after);
  expectCode(
    () =>
      createDossier(
        value.storage,
        { key: value.key, title: TITLE + " новое", category: "active" },
        true,
      ),
    "already_managed",
  );
});

test("F02: adopt не перезаписывает существующий manifest или частичный history", async (context) => {
  for (const collision of ["manifest", "history"])
    await context.test(collision, (child) => {
      const value = fixture(child);
      const base = `.ai-workspace/tasks/${value.key}`;
      value.storage.write(`${base}/TASK.md`, "# Legacy без потерь\r\n");
      value.storage.write(
        collision === "manifest"
          ? `${base}/artifact-manifest.json`
          : `.ai-workspace/history/${value.key}/partial.txt`,
        "Существующее состояние требует разбора.\n",
      );
      const before = workspaceFiles(value);
      expectCode(
        () =>
          createDossier(
            value.storage,
            { key: value.key, title: TITLE, category: "active" },
            true,
          ),
        collision === "manifest"
          ? "artifact_manifest_exists"
          : "dossier_collision",
      );
      assert.deepEqual(workspaceFiles(value), before);
    });
});

test("F02: частичная инициализация create/adopt не затирается повторным запуском", async (context) => {
  for (const adopt of [false, true])
    await context.test(adopt ? "adopt" : "create", (child) => {
      const value = fixture(child);
      const base = `.ai-workspace/tasks/${value.key}`;
      const original = "# Legacy\r\n<!-- точные исходные bytes -->\n";
      if (adopt) value.storage.write(`${base}/TASK.md`, original);
      const write = value.storage.write.bind(value.storage);
      value.storage.write = (relative, ...args) => {
        if (relative === `${base}/TASK.md`)
          throw Object.assign(new Error("Прерывание записи TASK"), {
            code: "fixture_interruption",
          });
        return write(relative, ...args);
      };
      try {
        expectCode(
          () =>
            createDossier(
              value.storage,
              {
                key: value.key,
                title: TITLE,
                ...(adopt ? { category: "active" } : {}),
              },
              adopt,
            ),
          "fixture_interruption",
        );
      } finally {
        value.storage.write = write;
      }
      assert.ok(value.storage.exists(`${base}/artifact-manifest.json`));
      if (adopt)
        assert.equal(
          value.storage.read(`${base}/TASK.md`).toString(),
          original,
        );
      else assert.equal(value.storage.exists(`${base}/TASK.md`), false);
      const before = workspaceFiles(value);
      expectCode(() => create(value), "operation_recovery_required");
      expectCode(
        () =>
          createDossier(
            value.storage,
            { key: value.key, title: TITLE + " новый", category: "active" },
            true,
          ),
        "operation_recovery_required",
      );
      assert.deepEqual(workspaceFiles(value), before);
      const operation = readWorkspaceOperationState(
        value.storage,
        value.key,
      ).pending;
      assert.ok(operation);
      recoverWorkspaceTaskOperation(
        value.storage,
        value.key,
        operation.operationId,
      );
      assert.equal(dossier(value).meta.revision, 1);
      if (adopt) assert.equal(dossier(value).body, original);
    });
});

test("F02: утрата, повреждение и чужой manifest блокируют close и обычную запись", async (context) => {
  /** @type {[string, Record<string, string>, (value: SafetyFixture, file: string, data: ArtifactManifest) => unknown][]} */
  const changes = [
    [
      "missing",
      { code: "artifact_manifest_missing" },
      (value, file) => value.storage.unlink(file),
    ],
    [
      "invalid JSON",
      { code: "invalid_json" },
      (value, file) => value.storage.write(file, "{broken\n"),
    ],
    [
      "invalid schema",
      { name: "ZodError" },
      (value, file, data) =>
        value.storage.writeJson(file, { ...data, schemaVersion: 99 }),
    ],
    [
      "foreign owner",
      { code: "artifact_owner_mismatch" },
      (value, file, data) =>
        value.storage.writeJson(file, {
          ...data,
          localDossierId: "00000000-0000-4000-8000-000000000000",
        }),
    ],
  ];
  for (const [name, expected, change] of changes)
    await context.test(name, (child) => {
      const value = fixture(child);
      create(value);
      publishWorkspaceResult(
        value.storage,
        value.key,
        dossier(value).meta.revision,
        {
          summary: "Результат без обязательных артефактов",
          artifacts: [],
          checks: [],
        },
      );
      temporaryArtifact(value, {
        producer: { id: "unsettled", pid: null, settled: false },
      });
      expectCode(
        () => mutate(value, { category: "closed" }),
        "producer_active",
      );
      const current = dossier(value);
      const data = manifest(value);
      change(value, `${current.base}/artifact-manifest.json`, data);
      const before = workspaceFiles(value);
      assert.throws(() => manifest(value), expected);
      assert.throws(() => mutate(value, { category: "closed" }), expected);
      assert.throws(
        () => planDossierMetadata(value.storage, current, current.meta, data),
        expected,
      );
      expectCode(
        () =>
          prepareDossierInitialization(
            value.storage,
            current.meta,
            current.body,
            current,
          ),
        "already_managed",
      );
      assert.deepEqual(workspaceFiles(value), before);
    });
});

test("F02: обычная запись manifest не меняет владельца managed-досье", (context) => {
  const value = fixture(context);
  create(value);
  const before = workspaceFiles(value);
  expectCode(
    () =>
      planDossierMetadata(value.storage, dossier(value), dossier(value).meta, {
        ...manifest(value),
        localDossierId: "00000000-0000-4000-8000-000000000000",
      }),
    "artifact_owner_mismatch",
  );
  assert.deepEqual(workspaceFiles(value), before);
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
      Reflect.apply(createDossier, undefined, [
        value.storage,
        { key: value.key, title: TITLE, category: "done" },
        true,
      ]),
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
        Reflect.apply(updateDossier, undefined, [
          value.storage,
          value.key,
          expectedRevision,
          {
            category: "active",
          },
        ]),
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
      planDossierMetadata(value.storage, stale, {
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
  assert.ok(closed.result);
  assert.equal(dossier(value).body, BODY);
  assert.equal(closed.result.criteriaHash, dossier(value).bodyHash);
  assert.deepEqual(manifest(value).artifacts[0].retention.referencedBy, [
    "result:1",
  ]);
  expectCode(() => mutate(value, { category: "active" }), "reopen_required");
});

test("Непройденный или отсутствующий required check не закрывает и не завершает задачу", async (context) => {
  for (const status of /** @type {const} */ ([
    "failed",
    "not_required",
    "missing",
  ])) {
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

test("F01: причина отмены без cancelled outcome отклоняется без изменения файлов", (context) => {
  const value = fixture(context);
  readyResult(value, { acceptanceRequired: true, deliveryRequired: true });
  const before = workspaceFiles(value);
  for (const transition of [
    {},
    { category: "active" },
    { category: "done" },
    { category: "closed" },
    { category: "closed", outcome: "succeeded" },
  ]) {
    expectCode(
      () =>
        mutate(value, {
          ...transition,
          cancellationReason:
            "Нельзя дописать причину после проверки результата.",
        }),
      "cancellation_reason_requires_cancelled",
    );
    assert.deepEqual(workspaceFiles(value), before);
  }
});

test("F01: явная отмена сохраняет окончательное body и сбрасывает прежнюю приёмку", (context) => {
  const value = fixture(context);
  const submitted = readyResult(value, { acceptanceRequired: true });
  mutate(value, {
    acceptance: {
      ...submitted.acceptance,
      state: "accepted",
      resultHash: submitted.result.hash,
      criteriaHash: dossier(value).bodyHash,
      decidedAt: new Date().toISOString(),
    },
  });
  const original = dossier(value);
  assert.ok(original.meta.result);
  const originalManifest = manifest(value);
  const originalResult = value.storage.read(
    `${original.base}/${original.meta.result.path}`,
  );
  const closed = mutate(value, {
    category: "closed",
    outcome: "cancelled",
    cancellationReason: "  Решение владельца.  ",
  });
  const actual = dossier(value);
  const expectedBody = `${original.body}\nОтмена: Решение владельца.\n`;
  assert.equal(actual.body, expectedBody);
  assert.equal(actual.bodyHash, hashBytes(Buffer.from(expectedBody)));
  assert.equal(closed.outcome, "cancelled");
  assert.equal(closed.status.category, "closed");
  assert.equal(closed.revision, original.meta.revision + 1);
  assert.equal(closed.acceptance.state, "pending");
  assert.equal(closed.acceptance.criteriaHash, null);
  assert.equal(closed.acceptance.resultHash, null);
  assert.deepEqual(closed.result, original.meta.result);
  assert.ok(closed.result);
  assert.deepEqual(manifest(value), originalManifest);
  assert.deepEqual(
    value.storage.read(`${original.base}/${closed.result.path}`),
    originalResult,
  );
});

test("F01: отказ отмены при незавершённом producer не сохраняет новое body", (context) => {
  const value = fixture(context);
  readyResult(value);
  temporaryArtifact(value, {
    producer: { id: "unsettled", pid: null, settled: false },
  });
  const before = workspaceFiles(value);
  expectCode(
    () =>
      mutate(value, {
        category: "closed",
        outcome: "cancelled",
        cancellationReason: "Эта причина не должна попасть в TASK.",
      }),
    "producer_active",
  );
  assert.deepEqual(workspaceFiles(value), before);
});

test("F01: окончательное body допускает 512 KiB и отклоняет превышение на один байт", (context) => {
  const reason = "Причина с многобайтовыми символами.";
  const suffix = `\nОтмена: ${reason}\n`;
  const limit = 512 * 1024;
  for (const extraByte of [0, 1]) {
    const value = fixture(context);
    create(value, {
      body: "x".repeat(limit - Buffer.byteLength(suffix) + extraByte),
    });
    const before = workspaceFiles(value);
    const cancel = () =>
      mutate(value, {
        category: "closed",
        outcome: "cancelled",
        cancellationReason: reason,
      });
    if (extraByte) {
      expectCode(cancel, "body_limit");
      assert.deepEqual(workspaceFiles(value), before);
    } else {
      assert.equal(cancel().outcome, "cancelled");
      assert.equal(Buffer.byteLength(dossier(value).body), limit);
      assert.ok(dossier(value).body.endsWith(suffix));
    }
  }
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
  assert.equal(resultPointer(value).revision, 1);
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

test("Result crash сохраняет immutable result и блокирует другую publication до recovery", (context) => {
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
  expectCode(
    () => publish(value, { summary: "Новая успешная сдача" }),
    "operation_recovery_required",
  );
  const operation = readWorkspaceOperationState(
    value.storage,
    value.key,
  ).pending;
  assert.ok(operation);
  const published = workspaceTaskSchema.parse(
    recoverWorkspaceTaskOperation(
      value.storage,
      value.key,
      operation.operationId,
    ),
  );
  assert.ok(published.result);
  assert.equal(published.result.revision, 1);
  assert.equal(published.result.path, "logs/results/1.json");
  assert.deepEqual(value.storage.read(orphan), preserved);
  assert.equal(
    hashBytes(value.storage.read(`${base}/${published.result.path}`)),
    published.result.hash,
  );
  assert.deepEqual(manifest(value).artifacts[0].retention.referencedBy, [
    "result:1",
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
  /** @type {[string, string, (value: SafetyFixture) => unknown][]} */
  const changes = [
    [
      "result bytes",
      "result_changed",
      (value) =>
        value.storage.write(
          `${dossier(value).base}/${resultPointer(value).path}`,
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
  /** @type {ArtifactRegistration['retention']} */
  const retention = {
    mode: "temporary",
    pinned: false,
    keepReason: null,
    referencedBy: [],
  };
  /** @type {[string, Partial<ArtifactRegistration>, string][]} */
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
      Reflect.apply(registerWorkspaceArtifacts, undefined, [
        value.storage,
        value.key,
        dossier(value).meta.revision,
        { artifacts: [registration("tmp/attempt-two")], unknown: true },
      ]),
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
  /** @type {[string, string, (value: SafetyFixture) => unknown][]} */
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
  assert.ok(submitted.meta.result);
  const acceptance = {
    ...submitted.meta.acceptance,
    state: "accepted",
    resultHash: submitted.meta.result.hash,
    criteriaHash: submitted.bodyHash,
    decidedAt: new Date().toISOString(),
  };
  const closed = mutate(value, { category: "closed", acceptance });
  assert.ok(closed.result);
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
  const journal = readCompletedWorkspaceOperation(
    value.storage,
    value.key,
    `${value.key}-reopen-${archived.revision}`,
  );
  assert.ok(journal);
  assert.ok(isWorkspaceRecord(journal.data.move));
  assert.ok(isWorkspaceRecord(journal.data.move.before));
  assert.deepEqual(journal.data.move.before.acceptance, acceptance);
  assert.deepEqual(
    moveDossier(value.storage, value.key, archived.revision, true),
    reopened,
  );
  const currentState = workspaceFiles(value);
  assert.deepEqual(
    moveDossier(value.storage, value.key, closed.revision),
    archived,
  );
  assert.deepEqual(workspaceFiles(value), currentState);
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

test("V08: литералы и Markdown различают точный путь, child и соседнее имя", () => {
  const root = "/tmp/realize-reference-matching/root";
  const target = ".ai-workspace/tasks/fixture-task/tmp/cache";
  const source = ".ai-workspace/tasks/other-task/TASK.md";
  const absolute = path.join(root, target);
  /** @type {Array<[string, string, boolean, boolean?]>} */
  const cases = [
    ["точный JSON-литерал", JSON.stringify(target), true],
    ["./ от корня в исходнике", JSON.stringify(`./${target}`), true, false],
    ["дочерний JSON-литерал", JSON.stringify(`${target}/output.txt`), true],
    ["одинарные кавычки", `'${target}'`, true],
    ["обратные кавычки", `\`${target}\``, true],
    ["обычный текст", `Вход: ${target}\n`, true],
    ["абсолютный путь", JSON.stringify(absolute), true],
    ["file URL", JSON.stringify(`file://${absolute}`), true],
    ["file:/ в исходнике", JSON.stringify(`file:${absolute}`), true, false],
    ["локальный file URL", JSON.stringify(`file://localhost${absolute}`), true],
    ["query и fragment", `[Вход](${target}?download=1#result)`, true],
    ["соседний суффикс", JSON.stringify(`${target}-v2`), false],
    ["суффикс файла", JSON.stringify(`${target}.json`), false],
    ["подчёркивание", JSON.stringify(`${target}_backup`), false],
    ["буква Unicode", JSON.stringify(`${target}я`), false],
    ["префикс внутри имени", JSON.stringify(`prefix${target}`), false],
    ["другой корень", JSON.stringify(`/another-root/${target}`), false],
    ["абсолютный сосед", JSON.stringify(`${absolute}-v2/file.txt`), false],
    [
      "file URL соседа",
      JSON.stringify(`file://${absolute}-v2/file.txt`),
      false,
    ],
    ["повтор после ложного совпадения", `"${target}-v2" "${target}"`, true],
    ["Markdown relative", "[Вход](../fixture-task/tmp/cache/output.txt)", true],
    [
      "Markdown angle/title",
      '[Вход](<../fixture-task/tmp/cache> "Описание")',
      true,
    ],
    [
      "Markdown definition",
      '[ref]: ../fixture-task/tmp/cache "Описание"',
      true,
    ],
    ["Markdown quoted path", "`../fixture-task/tmp/cache`", true],
    [
      "Markdown encoded path",
      "[Вход](../fixture-task/tmp/%63ache/output.txt)",
      true,
    ],
    [
      "Markdown сосед",
      "[Вход](../fixture-task/tmp/cache-v2/output.txt)",
      false,
    ],
  ];
  for (const [name, text, expected, dossier = true] of cases)
    assert.equal(
      matchWorkspaceReferences(root, source, text, target, dossier),
      expected,
      name,
    );
});

test("V08: consumer в tests удерживает cleanup, сосед cache-v2 не удерживает cache", (context) => {
  const value = fixture(context);
  create(value);
  const relative = "tmp/cache";
  const target = `${dossier(value).base}/${relative}`;
  value.storage.write(`${target}/output.txt`, "temporary fixture bytes\n");
  register(value, registration(relative));
  value.storage.write(
    "src/sibling.mjs",
    `export const input = ${JSON.stringify(`${target}-v2/output.txt`)};\n`,
  );
  assert.deepEqual(readWorkspaceReferences(value.storage, target), []);
  assert.ok(plan(value));
  value.storage.write(
    "tests/consumer.test.ts",
    `const input = ${JSON.stringify(`${target}/output.txt`)};\n`,
  );
  assert.deepEqual(readWorkspaceReferences(value.storage, target), [
    "tests/consumer.test.ts",
  ]);
  expectCode(() => plan(value), "source_reference_active");
  assert.equal(
    value.storage.read(`${target}/output.txt`).toString(),
    "temporary fixture bytes\n",
  );
});

test("V08: roots и лимиты не превращают неполный поиск в отсутствие consumers", (context) => {
  const value = fixture(context);
  const target = `.ai-workspace/tasks/${value.key}/tmp/cache`;
  const excluded = [
    "tests/node_modules/consumer.ts",
    "tests/.env.json",
    "tests/credentials.json",
    ".ai/tools/fixture/runtime/consumer.mjs",
    "documentation/reports/consumer.md",
    "documentation/temp/consumer.md",
    ".ai-workspace/tasks/other-task/logs/consumer.md",
  ];
  for (const file of excluded) value.storage.write(file, target);
  value.storage.write(
    "tests/oversized.bin",
    Buffer.alloc(workspaceReferenceScope.maxBytes + 1, 120),
  );
  value.storage.write("tests/sibling.mjs", JSON.stringify(`${target}-v2`));
  assert.deepEqual(readWorkspaceReferences(value.storage, target), []);
  value.storage.write(
    "tests/oversized.ts",
    Buffer.alloc(workspaceReferenceScope.maxBytes + 1, 120),
  );
  expectCode(
    () => readWorkspaceReferences(value.storage, target),
    "reference_scan_limit",
  );
});

test("V08: соседние TASK сохраняют Markdown-формы и исключают собственный TASK", (context) => {
  const value = fixture(context);
  const target = `.ai-workspace/tasks/${value.key}/tmp/cache`;
  value.storage.write(`.ai-workspace/tasks/${value.key}/TASK.md`, target);
  const other = ".ai-workspace/tasks/other-task/TASK.md";
  const forms = [
    `[Вход](../${value.key}/tmp/cache/output.txt)`,
    `[Вход](<../${value.key}/tmp/cache> "Описание")`,
    `[ref]: ../${value.key}/tmp/cache#result`,
    `\`../${value.key}/tmp/cache\``,
    `[Вход](file://${path.join(value.root, target)})`,
  ];
  for (const text of forms) {
    value.storage.write(other, text);
    assert.deepEqual(
      readWorkspaceReferences(value.storage, target),
      [other],
      text,
    );
  }
  value.storage.write(other, `[Вход](../${value.key}/tmp/cache-v2/output.txt)`);
  assert.deepEqual(readWorkspaceReferences(value.storage, target), []);
});

test("V08: archive сохраняет переносимые собственные ссылки и ссылку на соседнее досье", (context) => {
  const value = fixture(context);
  create(value, {
    body:
      BODY +
      `\n[Локально](logs/needed.txt)\n[Через parent](../${value.key}/logs/needed.txt)\n[Сосед](.ai-workspace/tasks/${value.key}-v2/logs/needed.txt)\n`,
  });
  value.storage.write(
    `${dossier(value).base}/logs/needed.txt`,
    "retained evidence\n",
  );
  const closed = mutate(value, {
    category: "closed",
    outcome: "cancelled",
    cancellationReason: "Изолированная проверка завершена.",
  });
  const beforeBody = dossier(value).body;
  moveDossier(value.storage, value.key, closed.revision);
  assert.equal(dossier(value).body, beforeBody);
  assert.equal(dossier(value).base, `.ai-workspace/history/${value.key}`);
  assert.equal(
    value.storage.read(`${dossier(value).base}/logs/needed.txt`).toString(),
    "retained evidence\n",
  );
});

test("V08: archive блокирует собственную относительную ссылку, остающуюся в tasks", (context) => {
  const value = fixture(context);
  create(value, {
    body:
      BODY +
      `\n[Непереносимая ссылка](../../tasks/${value.key}/logs/needed.txt)\n`,
  });
  const closed = mutate(value, {
    category: "closed",
    outcome: "cancelled",
    cancellationReason: "Изолированная проверка завершена.",
  });
  const before = value.storage.read(`${dossier(value).base}/TASK.md`);
  expectCode(
    () => moveDossier(value.storage, value.key, closed.revision),
    "dossier_consumer_active",
  );
  assert.deepEqual(
    value.storage.read(`${dossier(value).base}/TASK.md`),
    before,
  );
  assert.equal(
    value.storage.exists(`.ai-workspace/history/${value.key}`),
    false,
  );
});

test("V06: result отказывает внутри registered logs/results без изменения доказательств", (context) => {
  const value = fixture(context);
  create(value);
  const relative = "logs/results";
  value.storage.write(
    `${dossier(value).base}/${relative}/evidence.txt`,
    "Неизменяемое доказательство\n",
  );
  const artifact = register(
    value,
    registration(relative, {
      category: "log",
      retention: {
        mode: "retain",
        pinned: false,
        keepReason: null,
        referencedBy: [],
      },
    }),
  );
  const before = workspaceFiles(value);
  expectCode(
    () => publish(value, { artifacts: [artifactRef(artifact)], checks: [] }),
    "result_output_registered",
  );
  assert.deepEqual(workspaceFiles(value), before);
});

test("V06: planner защищает совпадение, потомка и предка registered output, включая unsettled", async (context) => {
  /** @type {[string, string, string, boolean][]} */
  const cases = [
    ["потомок", "logs/retained", "logs/retained/plan.json", true],
    ["совпадение", "logs/retained/plan.json", "logs/retained/plan.json", true],
    [
      "предок",
      "logs/retained/plan.json/child",
      "logs/retained/plan.json",
      true,
    ],
    ["чужой unsettled", "logs/retained", "logs/retained/plan.json", false],
  ];
  for (const [name, registered, output, settled] of cases)
    await context.test(name, (child) => {
      const value = fixture(child);
      create(value);
      temporaryArtifact(value);
      value.storage.write(
        `${dossier(value).base}/${registered}/evidence.txt`,
        "Сохранённые bytes\n",
      );
      register(
        value,
        registration(registered, {
          category: "log",
          producer: { id: "retained-producer", pid: null, settled },
          retention: {
            mode: "retain",
            pinned: false,
            keepReason: null,
            referencedBy: [],
          },
        }),
      );
      const before = workspaceFiles(value);
      expectCode(
        () =>
          planWorkspaceCleanup(
            value.storage,
            value.key,
            dossier(value).meta.revision,
            undefined,
            output,
          ),
        "cleanup_evidence_registered",
      );
      assert.deepEqual(workspaceFiles(value), before);
    });
});

test("V06: direct cleanup отклоняет конфликт receipt до journal и удаления tmp", (context) => {
  const value = fixture(context);
  create(value);
  const artifact = temporaryArtifact(value);
  const original = plan(value);
  const output = "logs/cleanup-results";
  value.storage.write(
    `${dossier(value).base}/${output}/evidence.txt`,
    "Сохранённая квитанция\n",
  );
  register(
    value,
    registration(output, {
      category: "log",
      retention: {
        mode: "retain",
        pinned: false,
        keepReason: null,
        referencedBy: [],
      },
    }),
  );
  // Пользователь может передать reviewed JSON напрямую: ревизии и hash здесь актуальны.
  // Поэтому отказ должен дать output guard, а не более ранний revision conflict.
  const { hash: previousHash, ...body } = original;
  assert.ok(previousHash);
  body.taskRevision = dossier(value).meta.revision;
  body.manifestRevision = manifest(value).revision;
  const reviewed = { ...body, hash: canonicalHash(body) };
  const reviewedPath = `${dossier(value).base}/logs/reviewed-plan.json`;
  value.storage.writeJson(reviewedPath, reviewed);
  const before = workspaceFiles(value);
  expectCode(
    () =>
      applyWorkspaceCleanup(value.storage, reviewed, {
        planPath: reviewedPath,
      }),
    "cleanup_evidence_registered",
  );
  assert.deepEqual(workspaceFiles(value), before);
  assert.equal(
    value.storage.exists(`${runtimeRoot}/operations/${value.key}/pending.json`),
    false,
  );
  const preserved = manifest(value).artifacts.find(
    (item) => item.id === artifact.id,
  );
  assert.ok(preserved);
  assert.equal(preserved.state, "ready");
});

test("P05: nullable result отклоняется явными lifecycle gates", (context) => {
  const value = fixture(context);
  const published = readyResult(value, { acceptanceRequired: true });
  const current = dossier(value);
  const result = workspaceResultSchema.parse(
    value.storage.json(`${current.base}/${published.result.path}`),
  );
  assert.deepEqual(assertResultPointer(current), published.result);
  current.meta.result = null;
  expectCode(() => assertResultPointer(current), "result_required");
  expectCode(() => assertResult(current, result), "result_required");
  expectCode(() => assertClosed(current), "acceptance_required");
});

test("P05: safeRelative сохраняет запрет ASCII controls и обратного слеша", () => {
  for (let code = 0; code < 32; code++) {
    expectCode(
      () => safeRelative(`logs/file${String.fromCharCode(code)}name`),
      "unsafe_path",
    );
  }
  expectCode(() => safeRelative("logs\\file.txt"), "unsafe_path");
  assert.equal(safeRelative("logs/русский файл.txt"), "logs/русский файл.txt");
});

test("P05: ошибка atomic write сохраняется при удалении temporary до и после rename", (context) => {
  const value = fixture(context);
  value.storage.write("bucket/file.txt", "before");
  const rename = fs.renameSync;
  for (const renamed of [false, true]) {
    const failure = new Error(`fixture rename ${renamed ? "after" : "before"}`);
    /** @type {typeof fs.renameSync} */
    const failRename = (source, destination) => {
      if (renamed) rename(source, destination);
      throw failure;
    };
    const mocked = context.mock.method(fs, "renameSync", failRename);
    try {
      assert.throws(
        () => value.storage.write("bucket/file.txt", "after"),
        (error) => error === failure,
      );
    } finally {
      mocked.mock.restore();
    }
    assert.equal(
      value.storage.read("bucket/file.txt").toString(),
      renamed ? "after" : "before",
    );
    assert.deepEqual(value.storage.list("bucket"), ["file.txt"]);
  }
});

test("V06: cleanup повторно проверяет receipt после hooks перед rename и purge", async (context) => {
  for (const phase of ["beforeRename", "beforePurge"])
    await context.test(phase, (child) => {
      const value = fixture(child);
      create(value);
      const artifact = temporaryArtifact(value);
      const cleanup = plan(value);
      const evidence = "logs/cleanup-results";
      value.storage.write(
        `${dossier(value).base}/${evidence}/kept.txt`,
        "Чужое доказательство\n",
      );
      const taskBefore = value.storage.read(`${dossier(value).base}/TASK.md`);
      expectCode(
        () =>
          applyWorkspaceCleanup(value.storage, cleanup, {
            hook(currentPhase) {
              if (currentPhase !== phase) return;
              // Имитируем внешнее изменение manifest на границе разрушительного действия.
              const current = manifest(value);
              current.artifacts.push({
                ...current.artifacts[0],
                id: "00000000-0000-4000-8000-000000000001",
                path: evidence,
                category: "log",
                retention: {
                  mode: "retain",
                  pinned: false,
                  keepReason: null,
                  referencedBy: [],
                },
              });
              current.revision++;
              value.storage.writeJson(
                `${dossier(value).base}/artifact-manifest.json`,
                current,
              );
            },
          }),
        "cleanup_evidence_registered",
      );
      assert.deepEqual(
        value.storage.read(`${dossier(value).base}/TASK.md`),
        taskBefore,
      );
      assert.equal(
        value.storage
          .read(`${dossier(value).base}/${evidence}/kept.txt`)
          .toString(),
        "Чужое доказательство\n",
      );
      const preserved =
        phase === "beforeRename"
          ? `${dossier(value).base}/${artifact.path}`
          : `${runtimeRoot}/quarantine/${cleanup.requestId}/${artifact.id}`;
      assert.equal(
        value.storage.read(`${preserved}/output.txt`).toString(),
        "fixture temporary bytes\n",
      );
      assert.equal(manifest(value).artifacts[0].state, "ready");
    });
});

test("V06: registered sibling receipt не мешает новой очистке и не меняет прежние bytes", (context) => {
  const value = fixture(context);
  create(value);
  temporaryArtifact(value);
  const previous = "logs/cleanup-results/previous.json";
  value.storage.write(
    `${dossier(value).base}/${previous}`,
    '{"previous":true}\n',
  );
  const artifact = register(
    value,
    registration(previous, {
      category: "log",
      retention: {
        mode: "retain",
        pinned: false,
        keepReason: null,
        referencedBy: [],
      },
    }),
  );
  const cleanup = plan(value);
  const result = applyWorkspaceCleanup(value.storage, cleanup);
  assert.equal(result.status, "completed");
  assert.equal(
    value.storage.read(`${dossier(value).base}/${previous}`).toString(),
    '{"previous":true}\n',
  );
  assert.deepEqual(
    manifest(value).artifacts.find((item) => item.id === artifact.id),
    artifact,
  );
});
