/**
 * @file .ai/tools/worker-assignment/test/auditHistoryAdmission.test.ts
 * @version 1.0.2
 * @date 2026-11-26
 * @description Проверяет допуск истории последовательных чтений временного назначения и отказ при подмене сообщений.
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { openAiChatPolicy } from "realize-ai-platform/model-providers/openai-chat-completions-policy";
import {
  admitOpenAiAuditRequest,
  prepareOpenAiAudit,
} from "../src/adapters/openAiAuditRequest.adapter";
import { inspectApiAuditAdmission } from "../src/admission/inspectApiAuditAdmission.service";
import { performSingleRead } from "../src/exchange/performSingleRead.service";
import type { AuditContinuation } from "../src/exchange/SingleRead.types";
import { bindAssignment } from "../src/bindAssignment.service";
import {
  createTemporaryAssignment,
  requiredSources,
} from "./temporaryAssignment.fixture";

test("допуск сверяет каждую пару чтений с её источником, попыткой и байтами запроса", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () =>
    assert.fail("Допуск истории должен проверяться без сети"),
  );
  t.after(() => assert.equal(fetch.mock.callCount(), 0));
  const entryPath = "src/module/entry.ts";
  const sharedPath = "src/shared/entry.ts";
  const reviewFileContents: Record<string, string> = {
    [entryPath]: "// модуль\nexport const id = 1;\n",
    [sharedPath]: "// общий файл\nexport const id = 2;\n",
  };

  for (const reviewPaths of [[entryPath], [entryPath, sharedPath]]) {
    const { policy, lockPath, lock } = await createTemporaryAssignment(t, {
      reviewScope: { paths: reviewPaths },
      reviewFileContents,
    });
    const binding = await bindAssignment(policy, lockPath);
    assert(binding.context, JSON.stringify(binding.report.issues));
    const initial = await prepareOpenAiAudit(policy, {
      lockPath,
      contextId: binding.context.contextId,
      model: openAiChatPolicy.model,
    });
    assert(initial.request);
    const { bound, attempt } = initial;
    const firstCall = { id: "first", path: entryPath, startLine: 1 };
    const secondCall = {
      id: "second",
      path: reviewPaths[reviewPaths.length - 1],
      startLine: 2,
    };

    async function read(
      requestId: string,
      { id, path, startLine }: { id: string; path: string; startLine: number },
      attemptId = attempt.attemptId,
    ) {
      const { continuation } = await performSingleRead(
        bound,
        attemptId,
        requestId,
        {
          role: "assistant",
          tool_calls: [
            {
              id,
              type: "function",
              function: {
                name: "repo_read_file",
                arguments: JSON.stringify({ path, startLine, lineCount: 1 }),
              },
            },
          ],
        },
      );
      const lines = reviewFileContents[path].split(/(?<=\n)/);
      assert.equal(continuation.result.tool_call_id, id);
      assert.deepEqual(JSON.parse(continuation.result.content), {
        path,
        startLine,
        endLine: startLine,
        truncated: startLine < lines.length,
        sha256: lock.files[path],
        text: lines[startLine - 1],
      });
      return continuation;
    }
    const admit = (history: readonly AuditContinuation[]) =>
      admitOpenAiAuditRequest(bound, attempt, lockPath, history);
    const first = await read(initial.request.id, firstCall);
    const next = await admit([first]);
    assert(next.request);
    const second = await read(next.request.id, secondCall);
    const history = [first, second];
    const last = await admit(history);
    assert.equal(
      last.report.status,
      "ready",
      JSON.stringify(last.report.issues),
    );
    assert(last.request);
    assert.deepEqual(
      last.report.evidence.access.readPaths,
      [...requiredSources, ...reviewPaths].toSorted(),
    );
    const request = last.request;
    const body = JSON.parse(request.body);
    const user = { role: "user", content: binding.context.initialInput };
    assert.deepEqual(body.messages, [
      user,
      first.assistant,
      first.result,
      second.assistant,
      second.result,
    ]);

    for (const invalid of [
      [structuredClone(first), second],
      [first, await read(next.request.id, { ...secondCall, id: firstCall.id })],
      [first, await read(initial.request.id, secondCall)],
      [first, await read(next.request.id, secondCall, "foreign-attempt")],
    ]) {
      const { report, request } = await admit(invalid);
      assert.equal(request, undefined);
      assert.equal(report.status, "blocked");
      assert.equal(report.issues[0].code, "tool_call_mismatch");
    }

    for (const [messages, code] of [
      [
        [user, second.assistant, second.result, first.assistant, first.result],
        "tool_call_mismatch",
      ],
      [
        [
          user,
          first.assistant,
          { ...first.result, content: second.result.content },
          second.assistant,
          second.result,
        ],
        "tool_call_mismatch",
      ],
      [[user, first.assistant, first.result], "tool_call_mismatch"],
      [
        [user, first.assistant, second.assistant, first.result, second.result],
        "transport_access_mismatch",
      ],
      [
        [user, first.assistant, first.result, user, second.result],
        "transport_access_mismatch",
      ],
    ] as const) {
      const replaced = {
        ...request,
        body: JSON.stringify({ ...body, messages }),
      };
      const decision = await inspectApiAuditAdmission(
        bound,
        attempt,
        {
          adapterId: openAiChatPolicy.adapterId,
          observedVersion: null,
          toolPolicy: openAiChatPolicy.toolPolicy,
          currentRequest: () => replaced,
        },
        lockPath,
        history,
      );
      assert.equal(decision.status, "blocked");
      assert.equal(decision.issues[0].code, code);
    }
  }
});
