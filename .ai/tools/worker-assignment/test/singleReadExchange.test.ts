/**
 * @file .ai/tools/worker-assignment/test/singleReadExchange.test.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Воспроизводит одно чтение статьи на имитаторе и проверяет фактические байты двух запросов.
 * @see documentation/architecture/assignment-adapter/single-read.md
 */
import assert from "node:assert/strict";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { openAiChatPolicy } from "../../../../services/ai-control-plane/src/model-providers/openaiChatCompletions.policy";
import { openSingleReadExchange } from "../src/exchange/openSingleReadExchange.service";
import type { SingleReadTransport } from "../src/exchange/SingleRead.types";
import {
  adjacent,
  articleAuditFixture,
  lockPath,
  view,
} from "./articleAudit.fixture";
import {
  admitOpenAiAuditRequest,
  prepareOpenAiAudit,
} from "../src/adapters/openAiAuditRequest.adapter";
import { performSingleRead } from "../src/exchange/performSingleRead.service";
import { callResponseSchema } from "../src/exchange/singleReadMessages.schemas";

const output = "Отчёт имитатора о проверенном диапазоне.";
const callId = "call-article-1";
const toolCall = (path: string, startLine: number) => ({
  role: "assistant",
  content: null,
  tool_calls: [
    {
      id: callId,
      type: "function",
      function: {
        name: "repo_read_file",
        arguments: JSON.stringify({ path, startLine, lineCount: 20 }),
      },
    },
  ],
});
type Request = Parameters<SingleReadTransport["send"]>[0];

async function setup(
  t: TestContext,
  path = view,
  finalReply?: SingleReadTransport["send"],
) {
  const f = await articleAuditFixture(t);
  const lines = (await readFile(join(f.root, view), "utf8")).match(
    /[^\n]*\n|[^\n]+$/g,
  )!;
  const startLine = lines.length - 2;
  const message = toolCall(path, startLine);
  const requests: Request[] = [];
  const transport: SingleReadTransport = {
    async send(request) {
      requests.push(structuredClone(request));
      if (requests.length === 2 && finalReply) return finalReply(request);
      const choice =
        requests.length === 1
          ? { finish_reason: "tool_calls", message }
          : {
              finish_reason: "stop",
              message: { role: "assistant", content: output },
            };
      return {
        attemptId: request.attemptId,
        requestId: request.requestId,
        body: { choices: [choice] },
      };
    },
  };
  const fetch = t.mock.method(globalThis, "fetch", () => {
    throw Error("Сеть недоступна имитатору");
  });
  t.after(() => assert.equal(fetch.mock.callCount(), 0));
  const selection = {
    lockPath,
    contextId: f.contextId,
    model: openAiChatPolicy.model,
  };
  const pending = await openSingleReadExchange(f.policy, selection, transport);
  assert("finish" in pending && pending.finish);
  assert.equal(pending.status, "pending");
  assert.equal(requests.length, 1);
  return { f, selection, requests, lines, startLine, message, pending };
}

test("одно чтение до received: связанный результат, фактические строки, два допуска и одна отправка при повторе", async (t) => {
  const { f, requests, lines, startLine, message, pending } = await setup(t);
  const key = pending.operation.key;
  assert.equal(key.toolCallId, callId);
  const [report, duplicate] = await Promise.all([
    pending.finish(key),
    pending.finish(key),
  ]);
  assert.deepEqual(duplicate, report);
  assert.equal(report.status, "received");
  assert("output" in report && report.output === output);
  assert.equal(requests.length, 2);
  const [first, next] = requests;
  assert.equal(first.attemptId, next.attemptId);
  assert.equal(key.requestId, first.requestId);
  assert.notEqual(first.requestId, next.requestId);
  const original = JSON.parse(first.body);
  const body = JSON.parse(next.body);
  assert.deepEqual(body.tools, original.tools);
  assert.equal(body.model, original.model);
  assert.equal(body.messages.length, 3);
  assert.deepEqual(body.messages.slice(0, 2), [original.messages[0], message]);
  const result = body.messages[2];
  assert.deepEqual([result.role, result.tool_call_id], ["tool", callId]);
  const receipt = {
    path: view,
    startLine,
    endLine: lines.length,
    truncated: false,
    sha256: f.lock.files[view],
  };
  assert.deepEqual(report.operation.receipt, receipt);
  assert.deepEqual(JSON.parse(result.content), {
    ...receipt,
    text: lines.slice(-3).join(""),
  });
  assert(!JSON.stringify(report.operation).includes('"text"'));
});

test("соседний путь: только FORBIDDEN в ответе tool, попытка доходит до received", async (t) => {
  const { requests, pending } = await setup(t, adjacent);
  const report = await pending.finish(pending.operation.key);
  assert.equal(report.status, "received");
  assert.equal(report.operation.code, "FORBIDDEN");
  assert.equal(report.operation.receipt, null);
  const tool = JSON.parse(requests[1].body).messages[2];
  assert.deepEqual(tool, {
    role: "tool",
    tool_call_id: callId,
    content: JSON.stringify({ code: "FORBIDDEN" }),
  });
});

test("файл изменился после чтения: подготовленный текст не передаётся", async (t) => {
  const { f, requests, pending } = await setup(t);
  assert(pending.operation.receipt);
  await appendFile(join(f.root, view), "\n// другая версия\n");
  const report = await pending.finish(pending.operation.key);
  assert.equal(report.status, "blocked");
  assert.equal(report.issues[0].code, "CONFLICT");
  assert.equal(requests.length, 1);
});

test("подмена tool_call_id закрывает ожидающий вызов и последующую повторную доставку", async (t) => {
  const { requests, pending } = await setup(t);
  const key = pending.operation.key;
  const report = await pending.finish({ ...key, toolCallId: "call-foreign" });
  assert.equal(report.status, "blocked");
  assert.equal(report.issues[0].code, "tool_call_mismatch");
  assert.equal((await pending.finish(key)).status, "blocked");
  assert.equal(requests.length, 1);
});

test("подмена идентификатора или байтов в самом сообщении tool не получает допуск V1", async (t) => {
  const f = await articleAuditFixture(t);
  const initial = await prepareOpenAiAudit(f.policy, {
    lockPath,
    contextId: f.contextId,
    model: openAiChatPolicy.model,
  });
  assert(initial.request);
  const assistant = callResponseSchema.parse({
    choices: [{ finish_reason: "tool_calls", message: toolCall(view, 1) }],
  }).choices[0].message;
  const { continuation } = await performSingleRead(
    initial.bound,
    initial.attempt.attemptId,
    initial.request.id,
    assistant,
  );
  for (const change of [
    { tool_call_id: "call-foreign" },
    { content: "подмена" },
  ]) {
    const original = { ...continuation.result };
    Object.assign(continuation.result, change);
    const next = await admitOpenAiAuditRequest(
      initial.bound,
      initial.attempt,
      lockPath,
      continuation,
    );
    assert(!next.request);
    assert.equal(next.report.issues[0].code, "tool_call_mismatch");
    Object.assign(continuation.result, original);
  }
});

test("обрыв после начала передачи не дублирует отправку", async (t) => {
  const { pending, requests } = await setup(t, view, async () => {
    throw Error("обрыв");
  });
  const report = await pending.finish(pending.operation.key);
  assert.equal(report.status, "delivery_unknown");
  assert.deepEqual(await pending.finish(pending.operation.key), report);
  assert.equal(requests.length, 2);
});

test("финальное сообщение чужого запроса не принимается", async (t) => {
  const { pending } = await setup(t, view, async (request) => ({
    attemptId: request.attemptId,
    requestId: "other",
    body: {
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: output },
        },
      ],
    },
  }));
  const report = await pending.finish(pending.operation.key);
  assert.equal(report.status, "blocked");
  assert.equal(report.issues[0].code, "request_mismatch");
});
