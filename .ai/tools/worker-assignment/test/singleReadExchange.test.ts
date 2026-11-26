/**
 * @file .ai/tools/worker-assignment/test/singleReadExchange.test.ts
 * @version 1.0.2
 * @date 2026-11-26
 * @description Проверяет одно чтение временного назначения и связывание двух запросов на транспорте в памяти.
 * @see documentation/architecture/assignment-adapter/single-read.md
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, test, type TestContext } from "node:test";
import { openAiChatPolicy } from "realize-ai-platform/model-providers/openai-chat-completions-policy";
import { openSingleReadExchange } from "../src/exchange/openSingleReadExchange.service";
import type { SingleReadTransport } from "../src/exchange/SingleRead.types";
import { bindAssignment } from "../src/bindAssignment.service";
import {
  createTemporaryAssignment,
  requiredSources,
} from "./temporaryAssignment.fixture";
import {
  admitOpenAiAuditRequest,
  prepareOpenAiAudit,
} from "../src/adapters/openAiAuditRequest.adapter";
import { performSingleRead } from "../src/exchange/performSingleRead.service";
import { callResponseSchema } from "../src/exchange/singleReadMessages.schemas";

const output = "Отчёт имитатора о проверенном диапазоне.";
const entryPath = "src/module/entry.ts";
const sharedPath = "src/shared/entry.ts";
const adjacentPath = "src/module/draft.ts";
const reviewScopes = [[entryPath], [entryPath, sharedPath]];
const reviewFileContents = {
  [entryPath]:
    "// модуль\nexport const id = 1;\nexport const active = true;\n// конец\n",
  [sharedPath]:
    "// общий файл\r\nexport const id = 2;\r\nexport const active = false;\r\n// без завершающего перевода строки",
};
const startLine = 2;
const toolCall = (path: string, startLine: number) => ({
  role: "assistant",
  content: null,
  tool_calls: [
    {
      id: randomUUID(),
      type: "function",
      function: {
        name: "repo_read_file",
        arguments: JSON.stringify({ path, startLine, lineCount: 20 }),
      },
    },
  ],
});
type Request = Parameters<SingleReadTransport["send"]>[0];

async function bindReadAssignment(t: TestContext, reviewPaths: string[]) {
  const { root, lock, policy, lockPath } = await createTemporaryAssignment(t, {
    reviewScope: { paths: reviewPaths },
    reviewFileContents,
  });
  const bound = await bindAssignment(policy, lockPath);
  assert(bound.context, JSON.stringify(bound.report.issues));
  const selection = {
    lockPath,
    contextId: bound.context.contextId,
    model: openAiChatPolicy.model,
  };
  return { root, policy, lock, selection };
}

async function simulateRead(
  { policy, selection }: Awaited<ReturnType<typeof bindReadAssignment>>,
  path: string,
  finalReply?: SingleReadTransport["send"],
) {
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
  const pending = await openSingleReadExchange(policy, selection, transport);
  assert("finish" in pending && pending.finish);
  assert.equal(pending.status, "pending");
  assert.equal(requests.length, 1);
  return { requests, message, pending };
}

describe("Обмен одним чтением на транспорте в памяти", () => {
  beforeEach((t) => {
    assert("mock" in t, "Для сетевой заглушки нужен контекст теста");
    const fetch = t.mock.method(globalThis, "fetch", () => {
      throw Error("Сеть недоступна имитатору");
    });
    t.after(() => assert.equal(fetch.mock.callCount(), 0));
  });
  test("одно чтение до received: связанный результат, фактические строки, два допуска и одна отправка при повторе", async (t) => {
    for (const reviewPaths of reviewScopes) {
      const assignment = await bindReadAssignment(t, reviewPaths);
      for (const path of reviewPaths) {
        const { requests, message, pending } = await simulateRead(
          assignment,
          path,
        );
        const callId = message.tool_calls[0].id;
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
        assert.equal(key.attemptId, first.attemptId);
        assert.notEqual(first.requestId, next.requestId);
        const original = JSON.parse(first.body);
        const body = JSON.parse(next.body);
        assert.deepEqual(
          original.tools[0].function.parameters.properties.path.enum.toSorted(),
          [...requiredSources, ...reviewPaths].toSorted(),
        );
        assert.deepEqual(body.tools, original.tools);
        assert.equal(body.model, original.model);
        assert.equal(body.messages.length, 3);
        assert.deepEqual(body.messages.slice(0, 2), [
          original.messages[0],
          message,
        ]);
        const result = body.messages[2];
        assert.deepEqual([result.role, result.tool_call_id], ["tool", callId]);
        const lines = (
          await readFile(join(assignment.root, path), "utf8")
        ).match(/[^\n]*\n|[^\n]+$/g);
        assert(lines);
        const receipt = {
          path,
          startLine,
          endLine: lines.length,
          truncated: false,
          sha256: assignment.lock.files[path],
        };
        assert.deepEqual(report.operation.receipt, receipt);
        assert.deepEqual(JSON.parse(result.content), {
          ...receipt,
          text: lines.slice(startLine - 1).join(""),
        });
        assert(!JSON.stringify(report.operation).includes('"text"'));
      }
    }
  });

  test("соседний путь: только FORBIDDEN в ответе tool, попытка доходит до received", async (t) => {
    for (const reviewPaths of reviewScopes) {
      const assignment = await bindReadAssignment(t, reviewPaths);
      await writeFile(
        join(assignment.root, adjacentPath),
        "// соседний файл\n// вне назначения\n",
      );
      const { requests, message, pending } = await simulateRead(
        assignment,
        adjacentPath,
      );
      const callId = message.tool_calls[0].id;
      const report = await pending.finish(pending.operation.key);
      assert.equal(report.status, "received");
      assert.equal(requests.length, 2);
      assert.equal(report.operation.outcome, "denied");
      assert.equal(report.operation.code, "FORBIDDEN");
      assert.equal(report.operation.receipt, null);
      const tool = JSON.parse(requests[1].body).messages[2];
      assert.deepEqual(tool, {
        role: "tool",
        tool_call_id: callId,
        content: JSON.stringify({ code: "FORBIDDEN" }),
      });
    }
  });

  test("файл изменился после чтения: подготовленный текст не передаётся", async (t) => {
    for (const reviewPaths of reviewScopes) {
      const assignment = await bindReadAssignment(t, reviewPaths);
      const path = reviewPaths[reviewPaths.length - 1];
      const { requests, pending } = await simulateRead(assignment, path);
      assert(pending.operation.receipt);
      await appendFile(join(assignment.root, path), "\n// другая версия\n");
      const report = await pending.finish(pending.operation.key);
      assert.equal(report.status, "blocked");
      assert.equal(report.issues[0].code, "CONFLICT");
      assert.equal(requests.length, 1);
    }
  });

  test("подмена tool_call_id закрывает ожидающий вызов и последующую повторную доставку", async (t) => {
    for (const reviewPaths of reviewScopes) {
      const assignment = await bindReadAssignment(t, reviewPaths);
      const { requests, pending } = await simulateRead(
        assignment,
        reviewPaths[0],
      );
      const key = pending.operation.key;
      const report = await pending.finish({
        ...key,
        toolCallId: "call-foreign",
      });
      assert.equal(report.status, "blocked");
      assert.equal(report.issues[0].code, "tool_call_mismatch");
      assert.equal((await pending.finish(key)).status, "blocked");
      assert.equal(requests.length, 1);
    }
  });

  test("подмена идентификатора или байтов в самом сообщении tool не получает допуск V1", async (t) => {
    for (const reviewPaths of reviewScopes) {
      const { policy, selection } = await bindReadAssignment(t, reviewPaths);
      const initial = await prepareOpenAiAudit(policy, selection);
      assert(initial.request);
      const assistant = callResponseSchema.parse({
        choices: [
          {
            finish_reason: "tool_calls",
            message: toolCall(reviewPaths[0], startLine),
          },
        ],
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
          selection.lockPath,
          continuation,
        );
        assert(!next.request);
        assert.equal(next.report.issues[0].code, "tool_call_mismatch");
        Object.assign(continuation.result, original);
      }
    }
  });

  test("обрыв после начала передачи не дублирует отправку", async (t) => {
    for (const reviewPaths of reviewScopes) {
      const assignment = await bindReadAssignment(t, reviewPaths);
      const { pending, requests } = await simulateRead(
        assignment,
        reviewPaths[0],
        async () => {
          throw Error("обрыв");
        },
      );
      const report = await pending.finish(pending.operation.key);
      assert.equal(report.status, "delivery_unknown");
      assert.deepEqual(await pending.finish(pending.operation.key), report);
      assert.equal(requests.length, 2);
    }
  });

  test("финальное сообщение чужого запроса не принимается", async (t) => {
    for (const reviewPaths of reviewScopes) {
      const assignment = await bindReadAssignment(t, reviewPaths);
      const { pending } = await simulateRead(
        assignment,
        reviewPaths[0],
        async (request) => ({
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
        }),
      );
      const report = await pending.finish(pending.operation.key);
      assert.equal(report.status, "blocked");
      assert.equal(report.issues[0].code, "request_mismatch");
    }
  });
});
