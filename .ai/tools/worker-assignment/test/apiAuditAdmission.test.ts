/**
 * @file .ai/tools/worker-assignment/test/apiAuditAdmission.test.ts
 * @version 1.0.2
 * @date 2026-11-26
 * @description Проверяет допуск локального запроса API по файлам и правам временного назначения.
 * @see documentation/architecture/assignment-adapter/contract.md
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { appendFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type {
  AdmissionAttempt,
  AuditApiAdapter,
  PreparedAuditApiRequest,
} from "../src/admission/AssignmentAdmission.types";
import { defineRepoReadFileTool } from "../src/admission/defineRepoReadFileTool.mapper";
import { inspectApiAuditAdmission } from "../src/admission/inspectApiAuditAdmission.service";
import { bindAssignment } from "../src/bindAssignment.service";
import {
  createTemporaryAssignment,
  requiredSources,
  rulePath,
} from "./temporaryAssignment.fixture";

const entryPath = "src/module/entry.ts";
const adjacentPath = "src/module/draft.ts";
const reviewScopes = [[entryPath], [entryPath, "src/shared/entry.ts"]];

async function setup(t: TestContext, reviewPaths: string[]) {
  const { root, policy, lockPath, lock } = await createTemporaryAssignment(t, {
    reviewScope: { paths: reviewPaths },
  });
  await writeFile(join(root, adjacentPath), "// соседний файл\n");
  const bound = await bindAssignment(policy, lockPath);
  assert(bound.context, JSON.stringify(bound.report.issues));
  const attempt: AdmissionAttempt = {
    attemptId: randomUUID(),
    bindingKind: "request",
    target: {
      adapterId: "api-fixture",
      providerId: "local-provider",
      selection: { kind: "model", id: "fixture-model" },
    },
  };
  const payload = {
    model: attempt.target.selection.id,
    messages: [{ role: "user", content: bound.context.initialInput }],
    tools: [defineRepoReadFileTool(Object.keys(lock.files))],
  };
  const request = {
    id: randomUUID(),
    attemptId: attempt.attemptId,
    body: JSON.stringify(payload),
    providerId: attempt.target.providerId,
    dispatch: bound.context.callTool,
  };
  const adapter: AuditApiAdapter = {
    adapterId: attempt.target.adapterId,
    observedVersion: null,
    toolPolicy: "explicit-functions-only",
    currentRequest: () => request,
  };
  const inspect = (
    overrides: Partial<AuditApiAdapter> = {},
    path = adjacentPath,
  ) =>
    inspectApiAuditAdmission(
      bound,
      attempt,
      { ...adapter, ...overrides },
      path,
    );
  return { root, lock, payload, request, inspect };
}

test("API подтверждает привязку запроса, закреплённые чтения и обе запрещённые операции", async (t) => {
  for (const reviewPaths of reviewScopes) {
    const { root, lock, request, inspect } = await setup(t, reviewPaths);
    const expectedSources = await Promise.all(
      requiredSources.map(async (path) => ({
        path,
        sha256: lock.files[path],
        bytes: (await stat(join(root, path))).size,
      })),
    );
    for (const observedVersion of [null, "local-client/2"]) {
      const result = await inspect({ observedVersion });
      assert.equal(result.status, "ready", JSON.stringify(result.issues));
      assert.deepEqual(result.evidence.binding, {
        kind: "request",
        id: request.id,
      });
      assert.equal(result.evidence.executor.observedVersion, observedVersion);
      assert.deepEqual(result.evidence.preparedSources, expectedSources);
      assert.deepEqual(result.evidence.access, {
        coverage: "complete",
        routes: [{ tool: "repo_read_file", via: "direct" }],
        readPaths: [...requiredSources, ...reviewPaths].toSorted(),
        writePaths: [],
        readsPinned: true,
        outsideReadDenied: true,
        writeDenied: true,
      });
      assert.deepEqual(
        result.evidence.observations.map((ref) => ref.kind).toSorted(),
        ["denial-probe", "dispatch-policy", "read-probe", "tool-catalog"],
      );
    }
  }
});

test("API: лишние возможности, подмена пути, провайдера, модели, ввода или диспетчера дают blocked", async (t) => {
  for (const reviewPaths of reviewScopes) {
    const { payload, request, inspect } = await setup(t, reviewPaths);
    const otherPaths = [...requiredSources, ...reviewPaths.slice(1)];
    const cases: [Partial<PreparedAuditApiRequest>, string][] = [
      ...[
        { ...payload, tools: [...payload.tools, { type: "web_search" }] },
        {
          ...payload,
          tools: [defineRepoReadFileTool([...otherPaths, adjacentPath])],
        },
        {
          ...payload,
          tools: [defineRepoReadFileTool([...otherPaths, rulePath])],
        },
        { ...payload, tools: [] },
        { ...payload, hosted_tools: ["search"] },
      ].map((data): [Partial<PreparedAuditApiRequest>, string] => [
        { body: JSON.stringify(data) },
        "transport_access_mismatch",
      ]),
      [
        { body: JSON.stringify({ ...payload, model: "other" }) },
        "executor_mismatch",
      ],
      [{ providerId: "other" }, "executor_mismatch"],
      [
        {
          body: JSON.stringify({
            ...payload,
            messages: [{ role: "user", content: "other" }],
          }),
        },
        "context_mismatch",
      ],
      [
        { dispatch: async (...args) => request.dispatch(...args) },
        "context_mismatch",
      ],
      [{ attemptId: randomUUID() }, "binding_unavailable"],
    ];
    for (const [change, code] of cases) {
      const snapshot = { ...request, ...change };
      const report = await inspect({ currentRequest: () => snapshot });
      assert.equal(report.status, "blocked");
      assert.equal(report.issues[0].code, code);
    }
  }
});

test("API: неподтверждённый профиль, потеря получателя, отказ пробы и изменившиеся байты закрывают допуск", async (t) => {
  for (const reviewPaths of reviewScopes) {
    const { root, request, inspect } = await setup(t, reviewPaths);
    let calls = 0;
    for (const [adapter, code] of [
      [{ toolPolicy: "unknown" }, "access_unverified"],
      [{ currentRequest: () => null }, "binding_unavailable"],
      [
        {
          currentRequest: () => {
            throw Error("unavailable");
          },
        },
        "binding_unavailable",
      ],
      [
        { currentRequest: () => (++calls === 1 ? request : { ...request }) },
        "binding_unavailable",
      ],
    ] as const) {
      const result = await inspect(adapter);
      assert.equal(result.status, "blocked");
      assert.equal(result.issues[0].code, code);
    }
    const changedPath = reviewPaths[reviewPaths.length - 1];
    const allowedProbe = await inspect({}, changedPath);
    assert.equal(allowedProbe.status, "blocked");
    assert.equal(allowedProbe.issues[0].code, "transport_access_mismatch");
    await appendFile(join(root, changedPath), "\n");
    const result = await inspect();
    assert.equal(result.status, "blocked");
    assert.equal(result.evidence.access.readsPinned, null);
    assert.equal(result.issues[0].code, "transport_read_mismatch");
  }
});
