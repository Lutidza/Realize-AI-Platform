/**
 * @file .ai/tools/worker-assignment/test/openAiAuditRequest.test.ts
 * @version 1.0.2
 * @date 2026-11-26
 * @description Проверяет допуск временного назначения и отправку проверенного запроса через приёмник в памяти.
 * @see documentation/architecture/assignment-adapter/openai-chat-completions.md
 */
import assert from "node:assert/strict";
import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
  openAiChatPolicy,
  resolveOpenAiChatPolicy,
} from "realize-ai-platform/model-providers/openai-chat-completions-policy";
import {
  preflightOpenAiAudit,
  submitOpenAiAuditRequest,
} from "../src/adapters/openAiAuditRequest.adapter";
import { bindAssignment } from "../src/bindAssignment.service";
import {
  createTemporaryAssignment,
  requiredSources,
} from "./temporaryAssignment.fixture";

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

test("допуск, отправка и чтение учитывают выбранные файлы временного назначения", async (t) => {
  const http = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("{}", { status: 200 }),
  );
  const entry = "src/module/entry.ts";
  const adjacent = "src/module/draft.ts";
  for (const reviewPaths of [[entry], [entry, "src/shared/entry.ts"]]) {
    http.mock.resetCalls();
    const { root, policy, lockPath, lock } = await createTemporaryAssignment(
      t,
      {
        reviewScope: { paths: reviewPaths },
      },
    );
    await writeFile(join(root, adjacent), "// соседний файл\n");
    const bound = await bindAssignment(policy, lockPath);
    assert(bound.context, JSON.stringify(bound.report.issues));
    const selection = {
      lockPath,
      contextId: bound.context.contextId,
      model: openAiChatPolicy.model,
    };
    const expectedPaths = [...requiredSources, ...reviewPaths].toSorted();
    const ready = await preflightOpenAiAudit(policy, selection);
    assert(ready.status === "ready" && "evidence" in ready);
    assert.equal(ready.providerPolicy?.id, openAiChatPolicy.id);
    assert.deepEqual(
      ready.evidence.preparedSources.map(({ path, sha256 }) => ({
        path,
        sha256,
      })),
      requiredSources.map((path) => ({ path, sha256: lock.files[path] })),
    );
    assert.deepEqual(ready.evidence.access.readPaths, expectedPaths);
    assert.deepEqual(ready.evidence.access.routes, [
      { tool: "repo_read_file", via: "direct" },
    ]);
    assert.equal(ready.evidence.access.writeDenied, true);
    assert.equal(ready.evidence.access.outsideReadDenied, true);
    assert.equal(ready.evidence.binding?.kind, "request");

    const unreviewed = { ...selection, model: "unreviewed-model" };
    const blocked = await preflightOpenAiAudit(policy, unreviewed);
    assert(blocked.status === "blocked" && "providerPolicy" in blocked);
    assert.equal(blocked.providerPolicy, null);
    assert.equal(blocked.issues[0].code, "access_unverified");
    const denied = await submitOpenAiAuditRequest(
      policy,
      unreviewed,
      "test-only",
    );
    assert.equal(denied.report.status, "blocked");
    assert.equal(http.mock.callCount(), 0);

    const submitted = await submitOpenAiAuditRequest(
      policy,
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
      { role: "user", content: bound.context.initialInput },
    ]);
    assert.equal(body.tools.length, 1);
    assert.equal(body.tools[0].function.name, "repo_read_file");
    assert.deepEqual(
      body.tools[0].function.parameters.properties.path.enum.toSorted(),
      expectedPaths,
    );

    for (const path of reviewPaths) {
      const read = await submitted.dispatch("repo_read_file", {
        path,
        lineCount: 1,
      });
      assert.equal(read.path, path);
      assert.equal(read.version.sha256, lock.files[path]);
    }
    await assert.rejects(
      submitted.dispatch("repo_read_file", { path: adjacent }),
      { code: "FORBIDDEN" },
    );
    await assert.rejects(submitted.dispatch("repo_write_file", {}), {
      code: "FORBIDDEN",
    });
    const changedPath = reviewPaths[reviewPaths.length - 1];
    await appendFile(join(root, changedPath), "\n");
    const stale = await submitOpenAiAuditRequest(
      policy,
      selection,
      "test-only",
    );
    assert.equal(stale.report.status, "blocked");
    assert.partialDeepStrictEqual(stale.report.issues[0], {
      code: "CONFLICT",
      path: changedPath,
    });
    assert.equal(http.mock.callCount(), 1);
  }
});
