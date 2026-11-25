/**
 * @file .ai/tools/worker-assignment/test/auditHistoryAdmission.test.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Проверяет привязку каждой пары сообщений истории к чтению одной попытки.
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { openAiChatPolicy } from "../../../../services/ai-control-plane/src/model-providers/openaiChatCompletions.policy";
import {
  admitOpenAiAuditRequest,
  prepareOpenAiAudit,
} from "../src/adapters/openAiAuditRequest.adapter";
import { inspectApiAuditAdmission } from "../src/admission/inspectApiAuditAdmission.service";
import { performSingleRead } from "../src/exchange/performSingleRead.service";
import type { AuditContinuation } from "../src/exchange/SingleRead.types";
import { articleAuditFixture, lockPath, view } from "./articleAudit.fixture";

test("допуск сверяет каждую пару чтений с её источником, попыткой и байтами запроса", async (t) => {
  const fixture = await articleAuditFixture(t);
  const initial = await prepareOpenAiAudit(fixture.policy, {
    lockPath,
    contextId: fixture.contextId,
    model: openAiChatPolicy.model,
  });
  assert(initial.request);
  const { bound, attempt } = initial;
  async function read(
    requestId: string,
    id: string,
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
              arguments: JSON.stringify({ path: view, lineCount: 1 }),
            },
          },
        ],
      },
    );
    return continuation;
  }
  const admit = (history: readonly AuditContinuation[]) =>
    admitOpenAiAuditRequest(bound, attempt, lockPath, history);
  const first = await read(initial.request.id, "first");
  const next = await admit([first]);
  assert(next.request);
  const second = await read(next.request.id, "second");
  const history = [first, second];
  const last = await admit(history);
  assert(last.request);
  const request = last.request;
  const body = JSON.parse(request.body);
  const user = { role: "user", content: fixture.result.context.initialInput };
  assert.deepEqual(body.messages, [
    user,
    first.assistant,
    first.result,
    second.assistant,
    second.result,
  ]);

  for (const invalid of [
    [structuredClone(first), second],
    [first, await read(next.request.id, "first")],
    [first, await read(initial.request.id, "second")],
    [first, await read(next.request.id, "second", "foreign-attempt")],
  ]) {
    const { report } = await admit(invalid);
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
        { ...first.result, content: "другие строки" },
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
});
