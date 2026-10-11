/**
 * @file .ai/tools/git-delivery/test/JsonLineRpcClient.adapter.test.ts
 * @version 1.0.2
 * @date 2026-10-11
 * @description Проверяет RPC, пределы вывода и завершение транспорта тестовыми Node-процессами.
 */

import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { readFile } from "node:fs/promises";
import { test, type TestContext } from "node:test";

import {
  JsonLineRPCClient,
  JsonLineRpcError,
} from "@realize/codex-adapter/rpc";
import type { JsonLineRPCClientOptions } from "@realize/codex-adapter/rpc";

const serverPrelude = `
  const { createInterface } = require('node:readline');
  const send = (message) => process.stdout.write(JSON.stringify(message) + '\\n');
  const lines = createInterface({ input: process.stdin });
`;

const notificationIterators = new WeakMap<
  JsonLineRPCClient,
  ReturnType<
    ReturnType<
      JsonLineRPCClient["getNotifications"]
    >[typeof Symbol.asyncIterator]
  >
>();

function notificationIterator(client: JsonLineRPCClient) {
  let iterator = notificationIterators.get(client);
  if (!iterator) {
    iterator = client.getNotifications()[Symbol.asyncIterator]();
    notificationIterators.set(client, iterator);
  }
  return iterator;
}

/** Читает ровно следующее событие: неожиданные уведомления не пропускаются. */
async function nextNotification(
  client: JsonLineRPCClient,
  method: string,
): Promise<unknown> {
  const notification = await notificationIterator(client).next();
  assert.equal(notification.done, false);
  assert.equal(notification.value.method, method);
  return notification.value.params;
}

function startServer(
  context: TestContext,
  script: string,
  options: Partial<JsonLineRPCClientOptions> = {},
): JsonLineRPCClient {
  const client = new JsonLineRPCClient({
    codexBinary: process.execPath,
    args: ["-e", `${serverPrelude}\n${script}`],
    workingDirectory: process.cwd(),
    environment: { CODEX_HOME: process.cwd() },
    ...options,
  });
  context.after(async () => client.close());
  client.start();
  return client;
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error) => {
    assert.ok(error instanceof JsonLineRpcError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.equal(error.cause, undefined);
    return true;
  };
}

test(
  "сопоставляет ответы не по порядку и доставляет notification до ответа",
  { timeout: 5_000 },
  async (context) => {
    const client = startServer(
      context,
      `
    const requests = [];
    lines.on('line', line => {
      const request = JSON.parse(line);
      requests.push(request);
      if (requests.length === 2) {
        send({ method: 'turn/completed', params: { done: true } });
        for (const current of requests.reverse()) send({ id: current.id, result: current.params });
      }
    });
  `,
    );
    const completed = nextNotification(client, "turn/completed");
    const first = client.request("first", { order: 1 });
    const second = client.request("second", { order: 2 });
    assert.deepEqual(await first, { order: 1 });
    assert.deepEqual(await second, { order: 2 });
    assert.deepEqual(await completed, { done: true });
  },
);

test(
  "передаёт notify и сохраняет очередь существующего producer API",
  { timeout: 5_000 },
  async (context) => {
    const client = startServer(
      context,
      `
    lines.on('line', line => {
      const request = JSON.parse(line);
      send({ method: 'received', params: request });
    });
  `,
    );
    client.notify("initialized", { value: false });
    const iterator = notificationIterator(client);
    const result = await iterator.next();
    assert.deepEqual(result.value, {
      method: "received",
      params: { method: "initialized", params: { value: false } },
    });
    await client.close();
    assert.equal((await iterator.next()).done, true);
  },
);

test(
  "отвечает на server request через callback с исходным string id",
  { timeout: 5_000 },
  async (context) => {
    const calls: unknown[] = [];
    const client = startServer(
      context,
      `
    send({ id: 'server-call', method: 'item/tool/call', params: { value: 7 } });
    lines.on('line', line => send({ method: 'response', params: JSON.parse(line) }));
  `,
      {
        onRequest: async (method, params) => {
          calls.push([method, params]);
          return { answer: 42 };
        },
      },
    );
    assert.deepEqual(await nextNotification(client, "response"), {
      id: "server-call",
      result: { answer: 42 },
    });
    assert.deepEqual(calls, [["item/tool/call", { value: 7 }]]);
  },
);

test(
  "скрывает ошибку callback в ответе серверу",
  { timeout: 5_000 },
  async (context) => {
    let resolveResponse!: (value: unknown) => void;
    const response = new Promise<unknown>((resolve) => {
      resolveResponse = resolve;
    });
    const client = startServer(
      context,
      `
    send({ id: 11, method: 'item/tool/call' });
    lines.on('line', line => send({ method: 'response', params: JSON.parse(line) }));
  `,
      {
        onRequest: async () => {
          throw new Error("private callback detail");
        },
        // Wire-ответ проверяется отдельно: отказ имеет приоритет в очереди потребителя.
        onNotification: (message) => {
          if (message.method === "response") resolveResponse(message.params);
        },
      },
    );
    assert.deepEqual((await notificationIterator(client).next()).value, {
      method: "realize/securityViolation",
    });
    assert.deepEqual(await response, {
      id: 11,
      error: { code: -32603, message: "codex_handler_failed" },
    });
  },
);

test(
  "сохраняет запрет server requests для прежнего потребителя",
  { timeout: 5_000 },
  async (context) => {
    const client = startServer(
      context,
      `
    send({ id: 1, method: 'unexpected/tool' });
  `,
    );
    const iterator = notificationIterator(client);
    assert.deepEqual((await iterator.next()).value, {
      method: "realize/securityViolation",
    });
  },
);

test(
  "не раскрывает message/data серверной ошибки",
  { timeout: 5_000 },
  async (context) => {
    const client = startServer(
      context,
      `
    lines.on('line', line => send({
      id: JSON.parse(line).id,
      error: { code: -1, message: 'private server detail', data: 'private data' },
    }));
  `,
    );
    await assert.rejects(
      client.request("fail"),
      hasCode("codex_request_failed"),
    );
  },
);

test(
  "неожиданный exit завершает все ожидания без stderr",
  { timeout: 5_000 },
  async (context) => {
    const controller = new AbortController();
    const client = startServer(
      context,
      `
    lines.on('line', () => {
      process.stderr.write('private stderr detail');
      process.exit(12);
    });
  `,
      { signal: controller.signal },
    );
    const notification = assert.rejects(
      nextNotification(client, "never"),
      hasCode("codex_process_exited"),
    );
    const request = assert.rejects(
      client.request("exit"),
      hasCode("codex_process_exited"),
    );
    await Promise.all([notification, request]);
    await client.close();
    await client.close();
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  },
);

test(
  "abort снимает ожидания и listener, close завершает процесс",
  { timeout: 5_000 },
  async (context) => {
    const controller = new AbortController();
    const client = startServer(
      context,
      `
    send({ method: 'ready', params: { pid: process.pid } });
    lines.on('line', () => {});
  `,
      { signal: controller.signal },
    );
    const ready = (await nextNotification(client, "ready")) as {
      pid: number;
    };
    const request = assert.rejects(
      client.request("wait"),
      hasCode("codex_aborted"),
    );
    const notification = assert.rejects(
      nextNotification(client, "never"),
      hasCode("codex_aborted"),
    );
    controller.abort(new Error("private abort detail"));
    await Promise.all([request, notification]);
    await client.close();
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    assert.throws(() => process.kill(ready.pid, 0), { code: "ESRCH" });
  },
);

test(
  "abort до start не запускает процесс",
  { timeout: 5_000 },
  async (context) => {
    const controller = new AbortController();
    controller.abort();
    const client = startServer(context, "throw new Error('must not run')", {
      signal: controller.signal,
    });
    await assert.rejects(client.request("anything"), hasCode("codex_aborted"));
    await client.close();
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  },
);

test(
  "ошибка spawn безопасна и не оставляет pending",
  { timeout: 5_000 },
  async (context) => {
    const client = startServer(context, "", {
      codexBinary: "/unavailable-codex-test-binary",
    });
    await assert.rejects(
      client.request("anything"),
      hasCode("codex_spawn_failed"),
    );
    await client.close();
  },
);

for (const [label, output] of [
  ["строка stdout", "process.stdout.write('x'.repeat(1024 * 1024 + 1))"],
  [
    "общий stdout",
    "process.stdout.write((' '.repeat(1023) + '\\n').repeat(4097))",
  ],
  ["stderr", "process.stderr.write('x'.repeat(4 * 1024 * 1024 + 1))"],
]) {
  test(`ограничивает ${label}`, { timeout: 5_000 }, async (context) => {
    const client = startServer(
      context,
      `lines.on('line', () => { ${output}; });`,
    );
    await assert.rejects(
      client.request("output"),
      hasCode("codex_output_limit"),
    );
    await client.close();
  });
}

for (const [label, output] of [
  ["JSON", "process.stdout.write('{private invalid json}\\n')"],
  ["UTF-8", "process.stdout.write(Buffer.from([0xff, 0x0a]))"],
  ["envelope", "send({ id: null, result: true })"],
]) {
  test(
    `отвергает недопустимый ${label} без исходного вывода`,
    { timeout: 5_000 },
    async (context) => {
      const client = startServer(
        context,
        `lines.on('line', () => { ${output}; });`,
      );
      await assert.rejects(
        client.request("invalid"),
        hasCode("codex_protocol_invalid"),
      );
    },
  );
}

test(
  "обрабатывает UTF-8 JSONL, разделённый внутри кодовой точки",
  { timeout: 5_000 },
  async (context) => {
    const client = startServer(
      context,
      `
    lines.on('line', line => {
      const bytes = Buffer.from(JSON.stringify({ id: JSON.parse(line).id, result: 'Привет' }) + '\\n');
      const split = bytes.indexOf(Buffer.from('П')) + 1;
      process.stdout.write(bytes.subarray(0, split));
      setTimeout(() => process.stdout.write(bytes.subarray(split)), 5);
    });
  `,
    );
    assert.equal(await client.request("utf8"), "Привет");
  },
);

test(
  "ошибка сериализации не оставляет request и не ломает дальнейший обмен",
  { timeout: 5_000 },
  async (context) => {
    const client = startServer(
      context,
      `
    lines.on('line', line => send({ id: JSON.parse(line).id, result: true }));
  `,
    );
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    await assert.rejects(
      client.request("invalid", cycle),
      hasCode("codex_input_invalid"),
    );
    await assert.rejects(
      client.request("large", { value: "x".repeat(1024 * 1024) }),
      hasCode("codex_input_limit"),
    );
    assert.equal(await client.request("valid"), true);
  },
);

test(
  "explicit environment не наследует переменные родителя",
  { timeout: 5_000 },
  async (context) => {
    const client = startServer(
      context,
      `
    lines.on('line', line => send({
      id: JSON.parse(line).id,
      result: { value: process.env.RPC_FIXTURE_VALUE, hasHome: 'HOME' in process.env },
    }));
  `,
      {
        environment: {
          CODEX_HOME: process.cwd(),
          RPC_FIXTURE_VALUE: "test-value",
        },
      },
    );
    assert.deepEqual(await client.request("environment"), {
      value: "test-value",
      hasHome: false,
    });
  },
);

test(
  "close принудительно завершает игнорирующих SIGTERM потомков",
  {
    timeout: 5_000,
    skip: process.platform !== "linux",
  },
  async (context) => {
    const client = startServer(
      context,
      `
    const child = require('node:child_process').spawn(process.execPath, ['-e',
      "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); process.stdout.write('ready\\\\n');"
    ], { stdio: ['ignore', 'pipe', 'ignore'], env: {} });
    child.stdout.once('data', () => send({ method: 'ready', params: { pid: process.pid, childPid: child.pid } }));
    process.on('SIGTERM', () => {});
  `,
    );
    const ready = (await nextNotification(client, "ready")) as {
      pid: number;
      childPid: number;
    };
    const started = Date.now();
    await client.close();
    assert.ok(Date.now() - started >= 900);
    assert.throws(() => process.kill(ready.pid, 0), { code: "ESRCH" });
    try {
      const stat = await readFile(`/proc/${ready.childPid}/stat`, "utf8");
      assert.match(stat, /^\d+ \(.*\) Z /);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        // Потомок может исчезнуть между открытием /proc/stat и чтением.
        (error.code !== "ENOENT" && error.code !== "ESRCH")
      )
        throw error;
    }
  },
);

test(
  "завершает группу после exit лидера, когда потомок держит stdout",
  { timeout: 5_000, skip: process.platform !== "linux" },
  async (context) => {
    const client = startServer(
      context,
      `
      require('node:child_process').spawn(process.execPath, ['-e',
        "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); process.stdout.write(JSON.stringify({ method: 'ready', params: {} }) + '\\\\n');"
      ], { stdio: ['ignore', 1, 2], env: {} });
      lines.on('line', () => process.exit(7));
    `,
    );
    await nextNotification(client, "ready");
    await assert.rejects(
      client.request("exit"),
      hasCode("codex_process_exited"),
    );
    await client.close();
  },
);
