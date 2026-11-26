/**
 * @file .ai/tools/worker-assignment/test/deliverAssignmentContext.test.ts
 * @version 1.2.1
 * @date 2026-11-26
 * @description Проверяет доставку временного назначения, диапазоны чтения и отказы транспорта в памяти.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { AssignmentToolRequest } from "../src/AssignmentTransport.types";
import { deliverAssignmentContext } from "../src/deliverAssignmentContext.service";
import { bindAssignment } from "../src/bindAssignment.service";
import {
  createTemporaryAssignment,
  requiredSources,
} from "./temporaryAssignment.fixture";
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
const entryPath = "src/module/entry.ts";
const sharedPath = "src/shared/entry.ts";
const adjacentPath = "src/module/draft.ts";
const reviewScopes = [[entryPath], [entryPath, sharedPath]];
const reviewFileContents = {
  [entryPath]:
    "// модуль\nexport const id = 1;\nexport const active = true;\n// конец\n",
  [sharedPath]:
    "// общий файл\nexport const id = 2;\nexport const active = false;\n// конец\n",
};

function readRequest(path: string): AssignmentToolRequest {
  return {
    ...testTurn,
    type: "tool",
    callId: `read:${path}`,
    name: "repo_read_file",
    args: { path, startLine: 2, lineCount: 2 },
  };
}

async function prepareDelivery(t: TestContext, reviewPaths: string[]) {
  const { root, policy, lockPath, lock } = await createTemporaryAssignment(t, {
    reviewScope: { paths: reviewPaths },
    reviewFileContents,
  });
  const bound = await bindAssignment(policy, lockPath);
  assert(bound.context, JSON.stringify(bound.report.issues));
  const { context, report } = bound;
  const deliver = (
    transport: RecordingAssignmentTransport,
    contextId = context.contextId,
  ) =>
    deliverAssignmentContext(
      policy,
      lockPath,
      contextId,
      transport,
      fixtureTarget,
    );
  return { root, lock, context, report, deliver };
}

test("первый запрос содержит точный initialInput, чтения и полученный ответ принадлежат этому ходу", async (t) => {
  for (const reviewPaths of reviewScopes) {
    const { root, lock, context, report, deliver } = await prepareDelivery(
      t,
      reviewPaths,
    );
    await writeFile(join(root, adjacentPath), "// соседний файл\n");
    const reads = reviewPaths.map(readRequest);
    const transport = new RecordingAssignmentTransport([
      ...reads,
      { ...readRequest(adjacentPath), callId: "adjacent" },
      { ...reads[0], callId: "write", name: "repo_write_file" },
      completed,
    ]);
    const result = await deliver(transport);
    assert.equal(result.status, "received");
    assert.deepEqual(transport.offeredTools, ["repo_read_file"]);
    assert.equal(transport.input, context.initialInput);
    const input = JSON.parse(transport.input);
    assert.deepEqual(input.assignment.reviewScope, { paths: reviewPaths });
    const expectedSources = await Promise.all(
      requiredSources.map(async (path) => ({
        path,
        text: await readFile(join(root, path), "utf8"),
      })),
    );
    assert.deepEqual(input.sources, expectedSources);

    for (const [index, path] of reviewPaths.entries()) {
      const reply = transport.replies[index];
      assert.equal(reply.callId, reads[index].callId);
      assert(reply.result.ok);
      const lines = (await readFile(join(root, path), "utf8")).split("\n");
      assert.equal(reply.result.read.path, path);
      assert.equal(reply.result.read.text, lines.slice(1, 3).join("\n") + "\n");
    }
    assert.deepEqual(transport.replies.slice(reads.length), [
      { callId: "adjacent", result: { ok: false, code: "FORBIDDEN" } },
      { callId: "write", result: { ok: false, code: "FORBIDDEN" } },
    ]);
    assert.deepEqual(
      result.reads,
      reviewPaths.map((path) => ({
        path,
        startLine: 2,
        endLine: 3,
        sha256: lock.files[path],
      })),
    );
    assert.equal(result.contextId, context.contextId);
    assert.equal(result.lockSha256, report.lockSha256);
    assert.equal(result.assignmentId, lock.id);
    assert.equal(result.revision, lock.revision);
    assert.equal(result.threadId, testTurn.threadId);
    assert.equal(result.turnId, testTurn.turnId);
    assert.equal(result.output, completed.output);
    assert(transport.closed);
  }
});

test("чужой запрос чтения или чужое завершение не передают данные и отчёт", async (t) => {
  for (const reviewPaths of reviewScopes) {
    const { deliver } = await prepareDelivery(t, reviewPaths);
    for (const event of [readRequest(reviewPaths[0]), completed]) {
      for (const foreign of [{ threadId: "other" }, { turnId: "other" }]) {
        const transport = new RecordingAssignmentTransport([
          { ...event, ...foreign },
          completed,
        ]);
        const result = await deliver(transport);
        assert.equal(result.status, "blocked");
        assert.equal(result.issues[0].code, "turn_mismatch");
        assert(!("output" in result));
        assert.deepEqual(transport.replies, []);
        assert(transport.closed);
      }
    }
  }
});

test("избыточные права блокируют первый запрос, недоступный контекст блокирует открытие транспорта", async (t) => {
  for (const reviewPaths of reviewScopes) {
    const { deliver } = await prepareDelivery(t, reviewPaths);
    const transport = new RecordingAssignmentTransport(
      [completed],
      ["repo_read_file", "shell"],
    );
    const result = await deliver(transport);
    assert.equal(result.status, "blocked");
    assert.equal(result.issues[0].code, "transport_access_mismatch");
    assert.equal(transport.input, undefined);
    assert(transport.closed);
    const unopened = new RecordingAssignmentTransport([completed]);
    const missing = await deliver(unopened, randomUUID());
    assert.equal(missing.status, "blocked");
    assert.equal(missing.issues[0].code, "context_unavailable");
    assert.equal(unopened.offeredTools, undefined);
    assert.equal(unopened.input, undefined);
  }
});

test("обрыв или пустое завершение не создают отчёт для приёмки", async (t) => {
  for (const reviewPaths of reviewScopes) {
    const { deliver } = await prepareDelivery(t, reviewPaths);
    for (const events of [[], [{ ...completed, output: " " }]]) {
      const transport = new RecordingAssignmentTransport(events);
      const result = await deliver(transport);
      assert.equal(result.status, "blocked");
      assert.equal(result.issues[0].code, "result_missing");
      assert(!("output" in result));
      assert(transport.closed);
    }
  }
});

test("каталог только MCP, лишний путь чтения или право записи блокируют отправку initialInput", async (t) => {
  for (const reviewPaths of reviewScopes) {
    const { deliver } = await prepareDelivery(t, reviewPaths);
    for (const observed of [
      { coverage: "mcp" } as const,
      { readPaths: [...requiredSources, ...reviewPaths, adjacentPath] },
      { writePaths: [reviewPaths[0]] },
    ]) {
      const transport = new RecordingAssignmentTransport(
        [completed],
        undefined,
        observed,
      );
      const result = await deliver(transport);
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
  }
});

test("утрата привязки после допуска блокирует передачу ввода", async (t) => {
  for (const reviewPaths of reviewScopes) {
    const { deliver } = await prepareDelivery(t, reviewPaths);
    const transport = new RecordingAssignmentTransport([], undefined, {
      expireOnSend: true,
    });
    const report = await deliver(transport);
    assert.equal(report.status, "blocked");
    assert.equal(report.issues[0].code, "binding_unavailable");
    assert.equal(transport.input, undefined);
  }
});
