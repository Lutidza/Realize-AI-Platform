/**
 * @file packages/payload-task-manager/src/contracts/workspace/workspaceContracts.test.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Проверяет строгую границу локальных manifest, разделение состояний и producer identity.
 * @see documentation/specifications/task-management-execution.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  workspaceArtifactManifestSchema,
  workspaceResultSchema,
  workspaceTaskSchema,
  workspaceTransitionSchema,
} from "@realize/payload-task-manager/workspace-contracts";
import type {
  WorkspaceArtifactManifest,
  WorkspaceResult,
  WorkspaceTask,
} from "@realize/payload-task-manager/workspace-contracts";

const DOSSIER_ID = "11111111-1111-4111-8111-111111111111";
const ARTIFACT_ID = "22222222-2222-4222-8222-222222222222";
const ATTEMPT_ID = "33333333-3333-4333-8333-333333333333";
const SERVER_TASK_ID = "44444444-4444-4444-8444-444444444444";
const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const LIST_ID = "66666666-6666-4666-8666-666666666666";
const BOOT_ID = "77777777-7777-4777-8777-777777777777";
const TIMESTAMP = "2026-10-13T12:00:00Z";
const RESULT_HASH = "a".repeat(64);
const CRITERIA_HASH = "b".repeat(64);

function createTaskFixture(): WorkspaceTask {
  return {
    schemaVersion: 1,
    localDossierId: DOSSIER_ID,
    localKey: "2026-10-13-local-task-lifecycle-a4e8",
    revision: 1,
    title: "Проверка локального досье",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    closedAt: null,
    archivedAt: null,
    status: { id: "in-progress", category: "active" },
    outcome: null,
    execution: {
      state: "running",
      runtimeRef: { owner: "ai-control-plane", id: "run-01" },
      stageId: "implementation",
      attemptId: ATTEMPT_ID,
    },
    acceptance: {
      required: true,
      state: "pending",
      resultHash: null,
      criteriaHash: null,
      decidedAt: null,
    },
    delivery: { required: false, state: "not_requested", evidence: [] },
    requiredChecks: ["schema-boundary"],
    result: {
      path: "result.json",
      hash: RESULT_HASH,
      criteriaHash: CRITERIA_HASH,
      revision: 1,
    },
    taskRef: {
      id: SERVER_TASK_ID,
      revision: 2,
      projectId: PROJECT_ID,
      listId: LIST_ID,
    },
    legacy: { originalBodyHash: RESULT_HASH, recordedAt: TIMESTAMP },
  };
}

function createManifestFixture(): WorkspaceArtifactManifest {
  return {
    schemaVersion: 1,
    localDossierId: DOSSIER_ID,
    revision: 1,
    artifacts: [
      {
        id: ARTIFACT_ID,
        revision: 1,
        path: "logs/schema-check.json",
        category: "log",
        bytes: 128,
        hash: RESULT_HASH,
        state: "ready",
        createdAt: TIMESTAMP,
        stageId: "implementation",
        attemptId: ATTEMPT_ID,
        producer: {
          id: "contract-check",
          pid: 1234,
          identity: { bootId: BOOT_ID, startTicks: "19230001" },
          settled: true,
        },
        retention: {
          mode: "retain",
          pinned: true,
          keepReason: "Evidence проверки результата",
          referencedBy: ["result:1"],
        },
      },
    ],
  };
}

function createResultFixture(): WorkspaceResult {
  return {
    schemaVersion: 1,
    localDossierId: DOSSIER_ID,
    revision: 1,
    criteriaHash: CRITERIA_HASH,
    submittedAt: TIMESTAMP,
    summary: "Локальные контракты проверены.",
    artifacts: [{ id: ARTIFACT_ID, revision: 1, hash: RESULT_HASH }],
    checks: [
      {
        id: "schema-boundary",
        status: "passed",
        evidence: "logs/schema-check.json",
      },
    ],
  };
}

test("Публичный export сохраняет полный manifest JSON и отдельную server identity", () => {
  const task = createTaskFixture();
  const manifest = createManifestFixture();
  const result = createResultFixture();
  assert.deepEqual(
    workspaceTaskSchema.parse(JSON.parse(JSON.stringify(task))),
    task,
  );
  assert.deepEqual(
    workspaceArtifactManifestSchema.parse(JSON.parse(JSON.stringify(manifest))),
    manifest,
  );
  assert.deepEqual(
    workspaceResultSchema.parse(JSON.parse(JSON.stringify(result))),
    result,
  );
  assert.notEqual(task.localDossierId, task.taskRef?.id);
});

test("Все вложенные объекты отклоняют поля вне allowlist", async (context) => {
  const task = createTaskFixture();
  const manifest = createManifestFixture();
  const artifact = manifest.artifacts[0];
  const result = createResultFixture();
  const unknown = { credentials: "fixture-value" };
  const cases = [
    {
      name: "task",
      schema: workspaceTaskSchema,
      input: { ...task, ...unknown },
    },
    {
      name: "task.status",
      schema: workspaceTaskSchema,
      input: { ...task, status: { ...task.status, ...unknown } },
    },
    {
      name: "task.execution",
      schema: workspaceTaskSchema,
      input: { ...task, execution: { ...task.execution, ...unknown } },
    },
    {
      name: "task.runtimeRef",
      schema: workspaceTaskSchema,
      input: {
        ...task,
        execution: {
          ...task.execution,
          runtimeRef: { ...task.execution.runtimeRef, ...unknown },
        },
      },
    },
    {
      name: "task.acceptance",
      schema: workspaceTaskSchema,
      input: { ...task, acceptance: { ...task.acceptance, ...unknown } },
    },
    {
      name: "task.delivery",
      schema: workspaceTaskSchema,
      input: { ...task, delivery: { ...task.delivery, ...unknown } },
    },
    {
      name: "task.result",
      schema: workspaceTaskSchema,
      input: { ...task, result: { ...task.result, ...unknown } },
    },
    {
      name: "task.taskRef",
      schema: workspaceTaskSchema,
      input: { ...task, taskRef: { ...task.taskRef, ...unknown } },
    },
    {
      name: "task.legacy",
      schema: workspaceTaskSchema,
      input: { ...task, legacy: { ...task.legacy, ...unknown } },
    },
    {
      name: "manifest",
      schema: workspaceArtifactManifestSchema,
      input: { ...manifest, ...unknown },
    },
    {
      name: "manifest.artifact",
      schema: workspaceArtifactManifestSchema,
      input: { ...manifest, artifacts: [{ ...artifact, ...unknown }] },
    },
    {
      name: "manifest.producer",
      schema: workspaceArtifactManifestSchema,
      input: {
        ...manifest,
        artifacts: [
          { ...artifact, producer: { ...artifact.producer, ...unknown } },
        ],
      },
    },
    {
      name: "manifest.producer.identity",
      schema: workspaceArtifactManifestSchema,
      input: {
        ...manifest,
        artifacts: [
          {
            ...artifact,
            producer: {
              ...artifact.producer,
              identity: { ...artifact.producer.identity, ...unknown },
            },
          },
        ],
      },
    },
    {
      name: "manifest.retention",
      schema: workspaceArtifactManifestSchema,
      input: {
        ...manifest,
        artifacts: [
          { ...artifact, retention: { ...artifact.retention, ...unknown } },
        ],
      },
    },
    {
      name: "result",
      schema: workspaceResultSchema,
      input: { ...result, ...unknown },
    },
    {
      name: "result.artifact",
      schema: workspaceResultSchema,
      input: { ...result, artifacts: [{ ...result.artifacts[0], ...unknown }] },
    },
    {
      name: "result.check",
      schema: workspaceResultSchema,
      input: { ...result, checks: [{ ...result.checks[0], ...unknown }] },
    },
    {
      name: "transition",
      schema: workspaceTransitionSchema,
      input: { category: "active", ...unknown },
    },
    {
      name: "transition.execution",
      schema: workspaceTransitionSchema,
      input: { execution: { ...task.execution, ...unknown } },
    },
    {
      name: "transition.acceptance",
      schema: workspaceTransitionSchema,
      input: { acceptance: { ...task.acceptance, ...unknown } },
    },
    {
      name: "transition.delivery",
      schema: workspaceTransitionSchema,
      input: { delivery: { ...task.delivery, ...unknown } },
    },
  ];
  for (const entry of cases) {
    await context.test(entry.name, () => {
      const parsed = entry.schema.safeParse(entry.input);
      assert.equal(parsed.success, false, entry.name);
      if (!parsed.success) {
        assert.ok(
          parsed.error.issues.some(
            (issue) => issue.code === "unrecognized_keys",
          ),
        );
      }
    });
  }
});

test("Paused/blocked остаются execution projections, а архив и приёмка не становятся task category", () => {
  const task = createTaskFixture();
  for (const state of ["paused", "blocked"] as const) {
    const parsed = workspaceTaskSchema.parse({
      ...task,
      execution: { ...task.execution, state },
    });
    assert.equal(parsed.status.category, "active");
    assert.equal(parsed.execution.state, state);
    assert.equal(
      workspaceTaskSchema.safeParse({
        ...task,
        status: { id: state, category: state },
      }).success,
      false,
    );
  }
  for (const category of ["completed", "accepted", "archived"]) {
    assert.equal(
      workspaceTransitionSchema.safeParse({ category }).success,
      false,
    );
  }
  assert.equal(
    workspaceTaskSchema.safeParse({ ...task, outcome: "archived" }).success,
    false,
  );
  assert.equal(
    workspaceTransitionSchema.safeParse({ action: "pause" }).success,
    false,
  );
  assert.equal(
    workspaceTransitionSchema.safeParse({
      execution: { ...task.execution, state: "pause" },
    }).success,
    false,
  );
});

test("Manifest и result отклоняют повторный artifact ID даже при другой revision", () => {
  const manifest = createManifestFixture();
  const result = createResultFixture();
  const duplicateManifest = workspaceArtifactManifestSchema.safeParse({
    ...manifest,
    artifacts: [
      manifest.artifacts[0],
      { ...manifest.artifacts[0], revision: 2 },
    ],
  });
  const duplicateResult = workspaceResultSchema.safeParse({
    ...result,
    artifacts: [result.artifacts[0], { ...result.artifacts[0], revision: 2 }],
  });
  assert.equal(duplicateManifest.success, false);
  assert.equal(duplicateResult.success, false);
  if (!duplicateManifest.success) {
    assert.deepEqual(duplicateManifest.error.issues[0].path, [
      "artifacts",
      1,
      "id",
    ]);
  }
});

test("Checks и удерживающие refs не могут скрывать повторяющиеся IDs", () => {
  const task = createTaskFixture();
  const result = createResultFixture();
  const manifest = createManifestFixture();
  assert.equal(
    workspaceTaskSchema.safeParse({
      ...task,
      requiredChecks: ["schema-boundary", "schema-boundary"],
    }).success,
    false,
  );
  assert.equal(
    workspaceResultSchema.safeParse({
      ...result,
      checks: [result.checks[0], { ...result.checks[0], status: "failed" }],
    }).success,
    false,
  );
  manifest.artifacts[0].retention.referencedBy = ["result:1", "result:1"];
  assert.equal(
    workspaceArtifactManifestSchema.safeParse(manifest).success,
    false,
  );
});

test("Producer PID требует process identity, а human producer сохраняет оба значения null", () => {
  const manifest = createManifestFixture();
  const producer = manifest.artifacts[0].producer;
  producer.identity = null;
  assert.equal(
    workspaceArtifactManifestSchema.safeParse(manifest).success,
    false,
  );
  producer.pid = null;
  assert.equal(
    workspaceArtifactManifestSchema.safeParse(manifest).success,
    true,
  );
  producer.identity = { bootId: BOOT_ID, startTicks: "0" };
  assert.equal(
    workspaceArtifactManifestSchema.safeParse(manifest).success,
    false,
  );
  producer.pid = 1234;
  assert.equal(
    workspaceArtifactManifestSchema.safeParse(manifest).success,
    true,
  );
  for (const startTicks of ["", "-1", "1.2", "1e3", "1".repeat(33)]) {
    producer.identity = { bootId: BOOT_ID, startTicks };
    assert.equal(
      workspaceArtifactManifestSchema.safeParse(manifest).success,
      false,
      startTicks,
    );
  }
  producer.identity = { bootId: BOOT_ID, startTicks: "9".repeat(32) };
  assert.equal(
    workspaceArtifactManifestSchema.safeParse(manifest).success,
    true,
  );
});

test("Числа, hash, UUID и ISO timestamp проверяются без coercion", () => {
  const task = createTaskFixture();
  const manifest = createManifestFixture();
  for (const revision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1"]) {
    assert.equal(
      workspaceTaskSchema.safeParse({ ...task, revision }).success,
      false,
    );
  }
  for (const bytes of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, "0"]) {
    assert.equal(
      workspaceArtifactManifestSchema.safeParse({
        ...manifest,
        artifacts: [{ ...manifest.artifacts[0], bytes }],
      }).success,
      false,
    );
  }
  assert.equal(
    workspaceTaskSchema.safeParse({ ...task, localDossierId: task.localKey })
      .success,
    false,
  );
  assert.equal(
    workspaceTaskSchema.safeParse({
      ...task,
      createdAt: "2026-02-30T12:00:00Z",
    }).success,
    false,
  );
  assert.equal(
    workspaceTaskSchema.safeParse({
      ...task,
      createdAt: "2026-10-13T15:00:00+03:00",
    }).success,
    true,
  );
  assert.equal(
    workspaceTaskSchema.safeParse({
      ...task,
      result: { ...task.result, hash: "A".repeat(64) },
    }).success,
    false,
  );
  assert.equal(
    workspaceTaskSchema.safeParse({
      ...task,
      result: { ...task.result, hash: "a".repeat(63) },
    }).success,
    false,
  );
  manifest.artifacts[0].bytes = 0;
  assert.equal(
    workspaceArtifactManifestSchema.safeParse(manifest).success,
    true,
  );
});

test("Version, обязательные nullable поля и metadata limits фиксируют v1 boundary", () => {
  const task = createTaskFixture();
  const manifest = createManifestFixture();
  assert.equal(
    workspaceTaskSchema.safeParse({ ...task, schemaVersion: 2 }).success,
    false,
  );
  assert.equal(
    workspaceTaskSchema.safeParse({ ...task, title: "a".repeat(241) }).success,
    false,
  );
  assert.equal(
    workspaceTaskSchema.safeParse({ ...task, localKey: "../task" }).success,
    false,
  );
  assert.equal(
    workspaceTaskSchema.safeParse({
      ...task,
      localKey: task.localKey.replace("-", "_"),
    }).success,
    false,
  );
  assert.equal(
    workspaceTaskSchema.safeParse({
      ...task,
      status: { ...task.status, id: "status\nother" },
    }).success,
    false,
  );
  const missingNullableField = structuredClone(task);
  Reflect.deleteProperty(missingNullableField, "taskRef");
  assert.equal(
    workspaceTaskSchema.safeParse(missingNullableField).success,
    false,
  );
  const missingIdentity = structuredClone(manifest);
  Reflect.deleteProperty(missingIdentity.artifacts[0].producer, "identity");
  assert.equal(
    workspaceArtifactManifestSchema.safeParse(missingIdentity).success,
    false,
  );
  task.requiredChecks = Array.from(
    { length: 129 },
    (_, index) => `check-${index}`,
  );
  assert.equal(workspaceTaskSchema.safeParse(task).success, false);
  manifest.artifacts = Array.from({ length: 1025 }, (_, index) => ({
    ...manifest.artifacts[0],
    id: `22222222-2222-4222-8222-${index.toString(16).padStart(12, "0")}`,
  }));
  assert.equal(
    workspaceArtifactManifestSchema.safeParse(manifest).success,
    false,
  );
});

test("Пустой durable result manifest допустим, structural validation не подменяет lifecycle gates", () => {
  const result = createResultFixture();
  result.artifacts = [];
  result.checks = [];
  assert.equal(workspaceResultSchema.safeParse(result).success, true);
  assert.deepEqual(workspaceTransitionSchema.parse({}), {});
  assert.deepEqual(workspaceTransitionSchema.parse({ category: "closed" }), {
    category: "closed",
  });
});
