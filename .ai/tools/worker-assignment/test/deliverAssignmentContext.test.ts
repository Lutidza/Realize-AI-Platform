/**
 * @file .ai/tools/worker-assignment/test/deliverAssignmentContext.test.ts
 * @version 1.2.0
 * @date 2026-11-25
 * @description Проверяет начальный запрос, границы чтения и принадлежность результата ходу без модели.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import type { AssignmentToolRequest } from "../src/AssignmentTransport.types";
import { deliverAssignmentContext } from "../src/deliverAssignmentContext.service";
import {
  adjacent,
  articleAuditFixture,
  lockPath,
  view,
} from "./articleAudit.fixture";
import {
  fixtureTarget,
  RecordingAssignmentTransport,
  testTurn,
} from "./RecordingAssignmentTransport.fixture";

const completed = {
  ...testTurn,
  type: "completed",
  output: "Тестовое сообщение транспорта.",
} as const;
const read: AssignmentToolRequest = {
  ...testTurn,
  type: "tool",
  callId: "read",
  name: "repo_read_file",
  args: { path: view, startLine: 2, lineCount: 2 },
};

test("первый запрос содержит точный initialInput; чтения и полученный ответ принадлежат этому ходу", async (t) => {
  const f = await articleAuditFixture(t);
  const transport = new RecordingAssignmentTransport([
    read,
    { ...read, callId: "adjacent", args: { path: adjacent } },
    { ...read, callId: "write", name: "repo_write_file" },
    completed,
  ]);
  const result = await deliverAssignmentContext(
    f.policy,
    lockPath,
    f.contextId,
    transport,
    fixtureTarget,
  );
  assert.equal(result.status, "received");
  assert.deepEqual(transport.offeredTools, ["repo_read_file"]);
  assert(f.result.context && transport.input);
  assert.deepEqual(
    Buffer.from(transport.input),
    Buffer.from(f.result.context.initialInput),
  );
  assert.equal(JSON.parse(transport.input).sources.length, 6);
  const [success, ...denials] = transport.replies;
  assert(success.result.ok);
  const lines = (await readFile(join(f.root, view), "utf8")).split("\n");
  assert.equal(success.result.read.text, lines.slice(1, 3).join("\n") + "\n");
  assert.deepEqual(
    denials.map((reply) => reply.result),
    Array(2).fill({ ok: false, code: "FORBIDDEN" }),
  );
  assert.deepEqual(result.reads, [
    { path: view, startLine: 2, endLine: 3, sha256: f.lock.files[view] },
  ]);
  assert.equal(result.contextId, f.contextId);
  assert.equal(result.lockSha256, f.result.report.lockSha256);
  assert.equal(result.assignmentId, f.lock.id);
  assert.equal(result.revision, f.lock.revision);
  assert.equal(result.threadId, testTurn.threadId);
  assert.equal(result.turnId, testTurn.turnId);
  assert.equal(result.output, completed.output);
  assert(transport.closed);
});

test("чужой запрос чтения или чужое завершение не передают данные и отчёт", async (t) => {
  const f = await articleAuditFixture(t);
  for (const event of [read, completed]) {
    for (const foreign of [{ threadId: "other" }, { turnId: "other" }]) {
      const transport = new RecordingAssignmentTransport([
        { ...event, ...foreign },
        completed,
      ]);
      const result = await deliverAssignmentContext(
        f.policy,
        lockPath,
        f.contextId,
        transport,
        fixtureTarget,
      );
      assert.equal(result.status, "blocked");
      assert.equal(result.issues[0].code, "turn_mismatch");
      assert(!("output" in result));
      assert.deepEqual(transport.replies, []);
      assert(transport.closed);
    }
  }
});

test("избыточные права блокируют первый запрос, недоступный контекст блокирует открытие транспорта", async (t) => {
  const f = await articleAuditFixture(t);
  const transport = new RecordingAssignmentTransport(
    [completed],
    ["repo_read_file", "shell"],
  );
  const result = await deliverAssignmentContext(
    f.policy,
    lockPath,
    f.contextId,
    transport,
    fixtureTarget,
  );
  assert.equal(result.status, "blocked");
  assert.equal(result.issues[0].code, "transport_access_mismatch");
  assert.equal(transport.input, undefined);
  assert(transport.closed);
  const unopened = new RecordingAssignmentTransport([completed]);
  const missing = await deliverAssignmentContext(
    f.policy,
    lockPath,
    randomUUID(),
    unopened,
    fixtureTarget,
  );
  assert.equal(missing.status, "blocked");
  assert.equal(missing.issues[0].code, "context_unavailable");
  assert.equal(unopened.offeredTools, undefined);
});

test("обрыв или пустое завершение не создают отчёт для приёмки", async (t) => {
  const f = await articleAuditFixture(t);
  for (const events of [[], [{ ...completed, output: " " }]]) {
    const transport = new RecordingAssignmentTransport(events);
    const result = await deliverAssignmentContext(
      f.policy,
      lockPath,
      f.contextId,
      transport,
      fixtureTarget,
    );
    assert.equal(result.status, "blocked");
    assert.equal(result.issues[0].code, "result_missing");
    assert(!("output" in result));
    assert(transport.closed);
  }
});

test("каталог только MCP, лишний путь чтения или право записи блокируют отправку initialInput", async (t) => {
  const f = await articleAuditFixture(t);
  for (const observed of [
    { coverage: "mcp" } as const,
    { readPaths: [...Object.keys(f.lock.files), adjacent] },
    { writePaths: [view] },
  ]) {
    const transport = new RecordingAssignmentTransport(
      [completed],
      undefined,
      observed,
    );
    const result = await deliverAssignmentContext(
      f.policy,
      lockPath,
      f.contextId,
      transport,
      fixtureTarget,
    );
    assert.equal(result.status, "blocked");
    assert.equal(
      result.issues[0].code,
      "coverage" in observed
        ? "native_tools_unverified"
        : "transport_access_mismatch",
    );
    assert.equal(transport.input, undefined);
    assert(transport.closed);
  }
});

test("утрата привязки после допуска блокирует передачу ввода", async (t) => {
  const f = await articleAuditFixture(t);
  const transport = new RecordingAssignmentTransport([], undefined, {
    expireOnSend: true,
  });
  const report = await deliverAssignmentContext(
    f.policy,
    lockPath,
    f.contextId,
    transport,
    fixtureTarget,
  );
  assert.equal(report.status, "blocked");
  assert.equal(report.issues[0].code, "binding_unavailable");
  assert.equal(transport.input, undefined);
});
