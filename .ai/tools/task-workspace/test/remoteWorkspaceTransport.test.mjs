/**
 * @file .ai/tools/task-workspace/test/remoteWorkspaceTransport.test.mjs
 * @version 1.1.0
 * @date 2026-10-19
 * @description Проверяет HTTP границу remote-first CLI на изолированном loopback сервере и ошибках TLS.
 * @see documentation/specifications/task-management-execution.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import { EventEmitter } from "node:events";
import { once } from "node:events";
import {
  probeRemoteWorkspace,
  sendRemoteWorkspaceTask,
} from "../src/remote/sendRemoteWorkspaceTask.adapter.mjs";

const projectId = "11111111-1111-4111-8111-111111111111";
const listId = "22222222-2222-4222-8222-222222222222";
const clientTaskId = "33333333-3333-4333-8333-333333333333";
/** @type {import('@realize/payload-task-manager/contracts').TaskWorkspaceCreateInput} */
const payload = {
  projectId,
  listId,
  clientTaskId,
  title: "HTTP fixture",
  description: "Body",
  status: "backlog",
  priority: "normal",
  assigneeId: null,
  gitBindings: [],
};
const list = {
  id: listId,
  projectId,
  title: "Tasks",
  revision: 1,
  createdAt: "2026-10-19T00:00:00.000Z",
  updatedAt: "2026-10-19T00:00:00.000Z",
};
const listPage = { ok: true, data: { items: [list], nextCursor: null } };
const selection = { projectId, listId: null, baseUrl: null };
const { clientTaskId: unused, ...editable } = payload;
void unused;
const taskResponse = {
  ok: true,
  data: {
    disposition: "created",
    task: {
      ...editable,
      id: "44444444-4444-4444-8444-444444444444",
      key: "TASK-1",
      revision: 1,
      createdBy: "actor",
      updatedBy: "actor",
      createdAt: "2026-10-19T00:00:00.000Z",
      updatedAt: "2026-10-19T00:00:00.000Z",
    },
  },
};

/** @param {import('node:test').TestContext} context
 * @param {import('node:http').RequestListener} handler
 */
async function server(context, handler) {
  const instance = http.createServer(handler);
  instance.listen(0, "127.0.0.1");
  await once(instance, "listening");
  context.after(
    () =>
      new Promise((resolve, reject) => {
        instance.closeAllConnections();
        instance.close((error) => (error ? reject(error) : resolve(undefined)));
      }),
  );
  const address = instance.address();
  assert.ok(address && typeof address !== "string");
  return {
    baseUrl: `http://127.0.0.1:${address.port}/api/task-manager`,
    token: "do-not-log-test-token",
  };
}

test("real HTTP sends exact POST and bounded valid envelopes are accepted", async (context) => {
  let received = "";
  const config = await server(context, (request, response) => {
    assert.equal(request.headers.authorization, "Bearer do-not-log-test-token");
    response.setHeader("content-type", "application/json");
    if (request.method === "GET") {
      assert.equal(
        request.url,
        `/api/task-manager/lists?projectId=${projectId}`,
      );
      response.end(JSON.stringify(listPage));
      return;
    }
    assert.equal(request.url, "/api/task-manager/tasks/from-workspace");
    request.on("data", (chunk) => {
      received += chunk.toString();
    });
    request.on("end", () => response.end(JSON.stringify(taskResponse)));
  });
  assert.deepEqual(await probeRemoteWorkspace(config, selection), {
    kind: "ready",
    reason: null,
    target: { baseUrl: config.baseUrl, projectId, listId },
  });
  assert.equal(
    (await sendRemoteWorkspaceTask(config, payload)).kind,
    "success",
  );
  assert.deepEqual(JSON.parse(received), payload);
});

test("GET503 is unavailable; POST5xx always ambiguous; auth/validation/rate failures reject", async (context) => {
  let status = 503;
  const config = await server(context, (_request, response) => {
    response.statusCode = status;
    response.end("private server failure text");
  });
  assert.deepEqual(await probeRemoteWorkspace(config, selection), {
    kind: "unavailable",
    reason: "remote_application_unavailable",
  });
  for (const value of [500, 502, 503, 504]) {
    status = value;
    assert.deepEqual(await sendRemoteWorkspaceTask(config, payload), {
      kind: "pending",
      reason: `remote_http_${value}`,
    });
  }
  for (const value of [401, 403, 404, 409, 422, 429]) {
    status = value;
    assert.deepEqual(await probeRemoteWorkspace(config, selection), {
      kind: "rejected",
      reason: `remote_http_${value}`,
    });
    assert.deepEqual(await sendRemoteWorkspaceTask(config, payload), {
      kind: "rejected",
      reason: `remote_http_${value}`,
    });
  }
});

test("redirect is rejected without forwarding JWT to destination", async (context) => {
  let destinationCalls = 0;
  const destination = await server(context, (_request, response) => {
    destinationCalls++;
    response.end("unexpected");
  });
  const config = await server(context, (_request, response) => {
    response.statusCode = 302;
    response.setHeader("location", `${destination.baseUrl}/projects`);
    response.end();
  });
  assert.equal(
    (await probeRemoteWorkspace(config, selection)).kind,
    "rejected",
  );
  assert.equal(
    (await sendRemoteWorkspaceTask(config, payload)).kind,
    "rejected",
  );
  assert.equal(destinationCalls, 0);
});

test("invalid, oversized and wrong-project POST responses remain pending without trusting body", async (context) => {
  let body = "not-json";
  const config = await server(context, (_request, response) =>
    response.end(body),
  );
  assert.equal(
    (await probeRemoteWorkspace(config, selection)).kind,
    "rejected",
  );
  assert.deepEqual(await sendRemoteWorkspaceTask(config, payload), {
    kind: "pending",
    reason: "remote_contract_invalid",
  });
  body = "x".repeat(2048);
  assert.deepEqual(
    await sendRemoteWorkspaceTask(config, payload, { responseLimit: 1024 }),
    { kind: "pending", reason: "remote_response_limit" },
  );
  body = JSON.stringify({
    ...taskResponse,
    data: {
      ...taskResponse.data,
      task: { ...taskResponse.data.task, projectId: clientTaskId },
    },
  });
  assert.deepEqual(await sendRemoteWorkspaceTask(config, payload), {
    kind: "pending",
    reason: "remote_target_mismatch",
  });
});

test("bounded GET timeout allows fallback, POST timeout and reset stay pending", async (context) => {
  let reset = false;
  const config = await server(context, (request) => {
    if (reset) request.socket.destroy();
  });
  assert.deepEqual(
    await probeRemoteWorkspace(config, selection, { timeoutMs: 25 }),
    {
      kind: "unavailable",
      reason: "remote_timeout",
    },
  );
  assert.deepEqual(
    await sendRemoteWorkspaceTask(config, payload, { timeoutMs: 25 }),
    { kind: "pending", reason: "remote_timeout" },
  );
  reset = true;
  assert.deepEqual(await sendRemoteWorkspaceTask(config, payload), {
    kind: "pending",
    reason: "remote_network_ambiguous",
  });
});

test("TLS trust and protocol failures reject preflight without local fallback", async (context) => {
  let code = "CERT_HAS_EXPIRED";
  context.mock.method(https, "request", () => {
    const request = new EventEmitter();
    return Object.assign(request, {
      end: () =>
        queueMicrotask(() =>
          request.emit(
            "error",
            Object.assign(new Error("secret certificate detail"), { code }),
          ),
        ),
      destroy: () => request,
    });
  });
  const config = {
    baseUrl: "https://example.invalid/api/task-manager",
    token: "test-only",
  };
  for (const value of [
    "CERT_HAS_EXPIRED",
    "CERT_REVOKED",
    "INVALID_CA",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "EPROTO",
  ]) {
    code = value;
    assert.deepEqual(await probeRemoteWorkspace(config, selection), {
      kind: "rejected",
      reason: "remote_tls_invalid",
    });
    assert.deepEqual(await sendRemoteWorkspaceTask(config, payload), {
      kind: "rejected",
      reason: "remote_tls_invalid",
    });
  }
  code = "UNKNOWN_TRANSPORT_ERROR";
  assert.deepEqual(await probeRemoteWorkspace(config, selection), {
    kind: "rejected",
    reason: "remote_transport_error",
  });
  assert.deepEqual(await sendRemoteWorkspaceTask(config, payload), {
    kind: "pending",
    reason: "remote_transport_error",
  });
});

test("list resolution rejects ambiguity including later pages and validates explicit project relation", async (context) => {
  let body = JSON.stringify(listPage);
  const config = await server(context, (_request, response) =>
    response.end(body),
  );
  for (const page of [
    { items: [], nextCursor: null },
    { items: [list, { ...list, id: clientTaskId }], nextCursor: null },
    {
      items: [list],
      nextCursor: "opaque-server-cursor_with-Case-0123456789ABCDEF",
    },
  ]) {
    body = JSON.stringify({ ok: true, data: page });
    assert.deepEqual(await probeRemoteWorkspace(config, selection), {
      kind: "rejected",
      reason: "remote_list_required",
    });
  }
  body = JSON.stringify({
    ok: true,
    data: { ...list, projectId: clientTaskId },
  });
  assert.deepEqual(
    await probeRemoteWorkspace(config, { ...selection, listId }),
    { kind: "rejected", reason: "remote_target_mismatch" },
  );
  body = JSON.stringify({ ok: true, data: list });
  assert.deepEqual(
    await probeRemoteWorkspace(config, { ...selection, listId }),
    {
      kind: "ready",
      reason: null,
      target: { baseUrl: config.baseUrl, projectId, listId },
    },
  );
});
