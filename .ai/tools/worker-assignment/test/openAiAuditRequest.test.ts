/**
 * @file .ai/tools/worker-assignment/test/openAiAuditRequest.test.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Проверяет реальный адаптер до сети и его границу отправки через приёмник в памяти.
 * @see documentation/architecture/assignment-adapter/openai-chat-completions.md
 */
import assert from "node:assert/strict";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
  openAiChatPolicy,
  resolveOpenAiChatPolicy,
} from "../../../../services/ai-control-plane/src/model-providers/openaiChatCompletions.policy";
import {
  preflightOpenAiAudit,
  submitOpenAiAuditRequest,
} from "../src/adapters/openAiAuditRequest.adapter";
import {
  articleAuditFixture,
  lockPath,
  adjacent,
  view,
} from "./articleAudit.fixture";

test("политика применяется к точному провайдеру, адресу, методу и снимку модели", () => {
  assert.equal(resolveOpenAiChatPolicy(openAiChatPolicy), openAiChatPolicy);
  for (const change of [
    { providerId: "other" },
    { method: "GET" },
    { endpoint: "https://example.org/v1/chat/completions" },
    { endpoint: "https://api.openai.com/v1/responses" },
    { model: "gpt-5.4-mini" },
  ])
    assert.equal(
      resolveOpenAiChatPolicy({ ...openAiChatPolicy, ...change }),
      null,
    );
});

test("рабочий адаптер: ready и blocked офлайн; отправка использует проверенный запрос и диспетчер", async (t) => {
  const f = await articleAuditFixture(t);
  const selection = {
    lockPath,
    contextId: f.contextId,
    model: openAiChatPolicy.model,
  };
  const http = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("{}", { status: 200 }),
  );
  const ready = await preflightOpenAiAudit(f.policy, selection);
  assert(ready.status === "ready" && "evidence" in ready);
  assert.equal(ready.providerPolicy?.id, openAiChatPolicy.id);
  assert.equal(ready.evidence.preparedSources.length, 6);
  assert.deepEqual(
    ready.evidence.access.readPaths,
    Object.keys(f.lock.files).toSorted(),
  );
  assert.equal(ready.evidence.access.readPaths?.length, 18);
  assert.deepEqual(ready.evidence.access.routes, [
    { tool: "repo_read_file", via: "direct" },
  ]);
  assert.equal(ready.evidence.access.writeDenied, true);
  assert.equal(ready.evidence.access.outsideReadDenied, true);
  assert.equal(ready.evidence.binding?.kind, "request");
  const unreviewed = { ...selection, model: "unreviewed-model" };
  const blocked = await preflightOpenAiAudit(f.policy, unreviewed);
  assert(blocked.status === "blocked" && "providerPolicy" in blocked);
  assert.equal(blocked.providerPolicy, null);
  assert.equal(blocked.issues[0].code, "access_unverified");
  const denied = await submitOpenAiAuditRequest(
    f.policy,
    unreviewed,
    "test-only",
  );
  assert.equal(denied.report.status, "blocked");
  assert.equal(http.mock.callCount(), 0);
  const submitted = await submitOpenAiAuditRequest(
    f.policy,
    selection,
    "test-only",
  );
  assert(
    submitted.dispatch &&
      submitted.response.ok &&
      "evidence" in submitted.report,
  );
  assert.notEqual(
    submitted.report.evidence.attemptId,
    ready.evidence.attemptId,
  );
  assert.equal(http.mock.callCount(), 1);
  const [url, options] = http.mock.calls[0].arguments;
  assert.equal(url, "https://api.openai.com/v1/chat/completions");
  assert.equal(options?.method, "POST");
  assert.equal(options?.redirect, "error");
  const body = JSON.parse(String(options?.body));
  assert.deepEqual(Object.keys(body).sort(), ["messages", "model", "tools"]);
  assert.equal(body.model, openAiChatPolicy.model);
  assert.deepEqual(body.messages, [
    { role: "user", content: f.result.context.initialInput },
  ]);
  assert.equal(body.tools.length, 1);
  assert.equal(body.tools[0].function.name, "repo_read_file");
  assert.deepEqual(
    body.tools[0].function.parameters.properties.path.enum.toSorted(),
    Object.keys(f.lock.files).toSorted(),
  );
  assert.equal(
    (await submitted.dispatch("repo_read_file", { path: view, lineCount: 1 }))
      .version.sha256,
    f.lock.files[view],
  );
  await assert.rejects(
    submitted.dispatch("repo_read_file", { path: adjacent }),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(submitted.dispatch("repo_write_file", {}), {
    code: "FORBIDDEN",
  });
  await appendFile(join(f.root, view), "\n");
  const stale = await submitOpenAiAuditRequest(
    f.policy,
    selection,
    "test-only",
  );
  assert.equal(stale.report.status, "blocked");
  assert.equal(http.mock.callCount(), 1);
});
