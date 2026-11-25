/**
 * @file .ai/tools/worker-assignment/test/apiAuditAdmission.test.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Проверяет локальный запрос API, действующие обработчики и привязку без пересылки.
 * @see documentation/architecture/assignment-adapter/article-audit-evidence.md
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type {
  AdmissionAttempt,
  AuditApiAdapter,
  PreparedAuditApiRequest,
} from "../src/admission/AssignmentAdmission.types";
import { articleReaderTool } from "../src/admission/articleReaderTool.mapper";
import { inspectApiAuditAdmission } from "../src/admission/inspectApiAuditAdmission.service";
import { adjacent, articleAuditFixture, view } from "./articleAudit.fixture";

async function setup(t: TestContext) {
  const f = await articleAuditFixture(t);
  const bound = await f.bind(f.contextId);
  assert(bound.context);
  const paths = Object.keys(f.lock.files);
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
    tools: [articleReaderTool(paths)],
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
  const inspect = (overrides: Partial<AuditApiAdapter> = {}, path = adjacent) =>
    inspectApiAuditAdmission(
      bound,
      attempt,
      { ...adapter, ...overrides },
      path,
    );
  return { f, paths, attempt, payload, request, inspect };
}

test("API: проверенный локальный запрос, 6 источников, 18 pins и обе запрещённые операции", async (t) => {
  const { f, paths, request, inspect } = await setup(t);
  for (const observedVersion of [null, "local-client/2"]) {
    const result = await inspect({ observedVersion });
    assert.equal(result.status, "ready", JSON.stringify(result.issues));
    assert.deepEqual(result.evidence.binding, {
      kind: "request",
      id: request.id,
    });
    assert.equal(result.evidence.executor.observedVersion, observedVersion);
    assert.deepEqual(
      result.evidence.preparedSources,
      f.result.report.delivered,
    );
    assert.equal(result.evidence.preparedSources.length, 6);
    assert.equal(paths.length, 18);
    assert.deepEqual(result.evidence.access, {
      coverage: "complete",
      routes: [{ tool: "repo_read_file", via: "direct" }],
      readPaths: paths.toSorted(),
      writePaths: [],
      readsPinned: true,
      outsideReadDenied: true,
      writeDenied: true,
    });
    assert.equal(
      new Set(result.evidence.observations.map((ref) => ref.kind)).size,
      4,
    );
  }
});

test("API: лишние возможности, подмена пути, провайдера, модели, ввода или диспетчера дают blocked", async (t) => {
  const { paths, payload, request, inspect } = await setup(t);
  const cases: [Partial<PreparedAuditApiRequest>, string][] = [
    ...[
      { ...payload, tools: [...payload.tools, { type: "web_search" }] },
      { ...payload, tools: [articleReaderTool([...paths.slice(1), adjacent])] },
      { ...payload, tools: [articleReaderTool([...paths.slice(1), paths[1]])] },
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
});

test("API: неподтверждённый профиль, потеря получателя, отказ пробы и изменившиеся байты закрывают допуск", async (t) => {
  const { f, request, inspect } = await setup(t);
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
  assert.equal(
    (await inspect({}, view)).issues[0].code,
    "transport_access_mismatch",
  );
  await appendFile(join(f.root, view), "\n");
  const result = await inspect();
  assert.equal(result.status, "blocked");
  assert.equal(result.evidence.access.readsPinned, null);
  assert.equal(result.issues[0].code, "transport_read_mismatch");
});
