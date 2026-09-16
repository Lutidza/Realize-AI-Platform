/**
 * @file tests/int/codexReadTools.int.spec.ts
 * @version 1.0.1
 * @date 2026-09-15
 * @description Проверяет привязку read tools к turn и закрытый RPC без обращения к модели.
 */

// @vitest-environment node

import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type {
  AgentEvent,
  AgentReadTools,
  RunTurnInput,
} from "@realize/ai-contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonLineRPCClientOptions } from "../../packages/codex-adapter/src/JsonLineRpcClient.types";
import type { RPCMessage } from "../../packages/codex-adapter/src/protocol";

const rpc = vi.hoisted(() => ({
  create: vi.fn(),
  request: vi.fn(),
  close: vi.fn(),
  spawn: vi.fn(),
  notifications: [] as RPCMessage[],
}));
vi.mock("node:child_process", () => ({ spawn: rpc.spawn }));
vi.mock("../../packages/codex-adapter/src/JsonLineRpcClient.adapter", () => ({
  JsonLineRPCClient: class {
    constructor(options: unknown) {
      rpc.create(options);
    }
    start() {}
    notify() {}
    request = rpc.request;
    close = rpc.close;
    async *getNotifications() {
      for (const message of rpc.notifications) yield message;
    }
  },
}));
vi.mock(
  "../../packages/codex-adapter/src/validateCodexImageInputs.validator",
  () => ({
    validateCodexImageInputs: async () => [],
  }),
);
vi.mock(
  "../../packages/codex-adapter/src/createCodexChatPermissions.config",
  () => ({
    createCodexChatPermissions: async () => ({
      binaryPath: "/fixture-codex",
      profile: {
        filesystem: { ":root": "deny", "/snapshot": "read" },
        network: { enabled: false },
      },
    }),
  }),
);

import { CodexReadTools } from "../../packages/codex-adapter/src/CodexReadTools.adapter";
import { OpenAICodexAdapter } from "../../packages/codex-adapter/src/OpenAICodexAdapter";

const definitions = [
  {
    name: "pages_search",
    description: "Найти доступную страницу по заголовку или slug.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { query: { type: "string" } },
    },
  },
];
const params = {
  threadId: "fixture-thread",
  turnId: "fixture-turn",
  callId: "fixture-call",
  tool: "pages_search",
  arguments: { query: "доставка" },
};
const input: RunTurnInput = {
  cwd: "/snapshot",
  developerInstructions: "fixture-policy",
  prompt: "найди страницу доставки",
  runID: "fixture-run",
  sandboxProfile: "analysis-readonly",
};
const collect = async (readTools?: AgentReadTools, run = input) => {
  const events: AgentEvent[] = [];
  for await (const event of new OpenAICodexAdapter({
    environment: { NODE_ENV: "test", CODEX_HOME: "/fixture-profile" },
    readTools,
  }).runTurn(run))
    events.push(event);
  return events;
};
const boundTools = (execute = vi.fn().mockResolvedValue({ pages: [] })) => {
  const tools = new CodexReadTools({ definitions, execute });
  tools.bind(params.threadId, params.turnId);
  return { tools, execute };
};

beforeEach(() => {
  rpc.create.mockReset();
  rpc.spawn.mockReset();
  rpc.close.mockReset().mockResolvedValue(undefined);
  rpc.request
    .mockReset()
    .mockImplementation(async (method: string) =>
      method.startsWith("thread/")
        ? { thread: { id: params.threadId } }
        : method === "turn/start"
          ? { turn: { id: params.turnId } }
          : {},
    );
  rpc.notifications = [
    {
      method: "turn/completed",
      params: {
        threadId: params.threadId,
        turn: {
          id: params.turnId,
          status: "completed",
          items: [{ type: "agentMessage", text: "Найдена страница." }],
        },
      },
    },
  ];
});
afterEach(() => vi.useRealTimers());

describe("Codex server-owned read tools", () => {
  it("регистрирует точные function definitions только в новом experimental thread и сохраняет sandbox", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ pages: [{ title: "Доставка" }] });
    expect(
      (
        await collect(
          { definitions, execute },
          { ...input, threadID: "old-tools-thread" },
        )
      ).at(-1)?.type,
    ).toBe("assistant.completed");
    expect(rpc.request).toHaveBeenCalledWith(
      "initialize",
      expect.objectContaining({ capabilities: { experimentalApi: true } }),
    );
    expect(rpc.request).not.toHaveBeenCalledWith(
      "thread/resume",
      expect.anything(),
    );
    expect(rpc.request).toHaveBeenCalledWith(
      "thread/start",
      expect.objectContaining({
        dynamicTools: definitions.map((definition) => ({
          type: "function",
          ...definition,
        })),
        approvalPolicy: "never",
        config: expect.objectContaining({
          permissions: {
            realize_chat_snapshot: {
              filesystem: { ":root": "deny", "/snapshot": "read" },
              network: { enabled: false },
            },
          },
        }),
      }),
    );
    expect(rpc.create.mock.calls[0]?.[0].onRequest).toBeTypeOf("function");
    expect(execute).not.toHaveBeenCalled();
  });

  it("без tools сохраняет legacy initialize и resume без обработчика server requests", async () => {
    await collect(undefined, { ...input, threadID: "legacy-thread" });
    expect(rpc.request).toHaveBeenCalledWith(
      "initialize",
      expect.objectContaining({ capabilities: null }),
    );
    expect(rpc.request).toHaveBeenCalledWith(
      "thread/resume",
      expect.objectContaining({ threadId: "legacy-thread" }),
    );
    expect(rpc.create.mock.calls[0]?.[0]).not.toHaveProperty("onRequest");
  });

  it("синтетические child и stale turn events не смешивают текст, usage и progress родителя", async () => {
    const eventsFor = (threadId: string, turnId: string, text: string) => [
      {
        method: "item/agentMessage/delta",
        params: { threadId, turnId, delta: text },
      },
      {
        method: "thread/tokenUsage/updated",
        params: {
          threadId,
          turnId,
          tokenUsage: {
            last: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
          },
        },
      },
      ...["item/started", "item/completed"].map((method) => ({
        method,
        params: {
          threadId,
          turnId,
          item: { type: "commandExecution", status: "completed" },
        },
      })),
    ];
    rpc.notifications = [
      ...eventsFor(
        "child-thread",
        "child-turn",
        "Child text must stay private.",
      ),
      ...eventsFor(params.threadId, "previous-turn", "Stale parent text."),
      ...eventsFor(params.threadId, params.turnId, "Текст текущего родителя."),
      {
        method: "turn/completed",
        params: {
          threadId: params.threadId,
          turn: { id: params.turnId, status: "completed", items: [] },
        },
      },
    ];
    const events = await collect(undefined, {
      ...input,
      sandboxProfile: "code-workspace-write",
    });
    expect(events.filter((event) => event.type === "assistant.delta")).toEqual([
      { type: "assistant.delta", delta: "Текст текущего родителя." },
    ]);
    expect(
      events.filter((event) => event.type === "usage.updated"),
    ).toHaveLength(1);
    expect(
      events.filter((event) => event.type.startsWith("tool.")),
    ).toHaveLength(2);
    expect(events.at(-1)).toEqual({
      type: "assistant.completed",
      content: "Текст текущего родителя.",
    });
    expect(JSON.stringify(events)).not.toMatch(/Child text|Stale parent/);
  });

  it("синтетические child terminal и прежний parent turn не завершают активный parent", async () => {
    const parent = rpc.notifications[0];
    rpc.notifications = [
      ...["completed", "failed", "interrupted"].map((status) => ({
        method: "turn/completed",
        params: {
          threadId: "child-thread",
          turn: {
            id: "child-turn",
            status,
            items: [{ type: "agentMessage", text: "Child final." }],
          },
        },
      })),
      {
        method: "turn/completed",
        params: {
          threadId: params.threadId,
          turn: {
            id: "previous-turn",
            status: "completed",
            items: [{ type: "agentMessage", text: "Stale final." }],
          },
        },
      },
      parent,
    ];
    const events = await collect();
    expect(
      events.filter((event) => event.type === "assistant.completed"),
    ).toEqual([{ type: "assistant.completed", content: "Найдена страница." }]);
    expect(
      events.some(
        (event) =>
          event.type === "run.cancelled" || event.type === "run.failed",
      ),
    ).toBe(false);
    expect(rpc.close).toHaveBeenCalledOnce();
  });

  it.each([
    { method: "item/started", type: "webSearch" },
    { method: "item/completed", type: "fileChange" },
    { method: "turn/completed", type: "mcpToolCall" },
    { method: "turn/completed", type: "dynamicToolCall" },
  ])(
    "child $type при $method по-прежнему блокирует весь запуск",
    async ({ method, type }) => {
      const item = { type, tool: "forbidden-child-tool" };
      rpc.notifications.unshift({
        method,
        params:
          method === "turn/completed"
            ? {
                threadId: "child-thread",
                turn: { id: "child-turn", status: "completed", items: [item] },
              }
            : { threadId: "child-thread", turnId: "child-turn", item },
      });
      const events = await collect();
      expect(events.at(-1)?.type).toBe("run.failed");
      expect(events.some((event) => event.type === "assistant.completed")).toBe(
        false,
      );
    },
  );

  it("transport security violation без threadId по-прежнему прерывает активный parent", async () => {
    rpc.notifications.unshift({ method: "realize/securityViolation" });
    const events = await collect();
    expect(events.at(-1)?.type).toBe("run.failed");
    expect(rpc.request).toHaveBeenCalledWith("turn/interrupt", {
      threadId: params.threadId,
      turnId: params.turnId,
    });
    expect(events.some((event) => event.type === "assistant.completed")).toBe(
      false,
    );
  });

  it.each([undefined, "review-readonly", "code-workspace-write"] as const)(
    "запрещает tools вне analysis-readonly: %s",
    async (sandboxProfile) => {
      expect(
        (
          await collect(
            { definitions, execute: vi.fn() },
            { ...input, sandboxProfile },
          )
        ).at(-1)?.type,
      ).toBe("run.failed");
      expect(rpc.create).not.toHaveBeenCalled();
    },
  );

  it("выдаёт безопасные lifecycle events без arguments, namespace и результата инструмента", async () => {
    const item = {
      type: "dynamicToolCall",
      id: params.callId,
      tool: params.tool,
      arguments: { query: "private-query" },
      contentItems: [{ text: "private-result" }],
      status: "completed",
      success: true,
    };
    rpc.notifications.unshift(
      ...["item/started", "item/completed"].map((method) => ({
        method,
        params: { threadId: params.threadId, turnId: params.turnId, item },
      })),
    );
    const events = await collect({ definitions, execute: vi.fn() });
    expect(events.filter((event) => event.type.startsWith("tool."))).toEqual([
      { type: "tool.started", summary: "Чтение данных CMS начато." },
      {
        type: "tool.completed",
        summary: "Чтение данных CMS завершено.",
        status: "completed",
      },
    ]);
    expect(JSON.stringify(events)).not.toMatch(/private-query|private-result/);
  });

  it.each(["item/started", "item/completed", "turn/completed"])(
    "блокирует неизвестный dynamic tool при %s",
    async (method) => {
      const item = {
        type: "dynamicToolCall",
        id: params.callId,
        tool: "pages_write",
        arguments: { secret: "private-input" },
      };
      rpc.notifications = [
        {
          method,
          params:
            method === "turn/completed"
              ? {
                  threadId: params.threadId,
                  turn: {
                    id: params.turnId,
                    status: "completed",
                    items: [item],
                  },
                }
              : { threadId: params.threadId, turnId: params.turnId, item },
        },
      ];
      const events = await collect({ definitions, execute: vi.fn() });
      expect(events.at(-1)?.type).toBe("run.failed");
      expect(JSON.stringify(events)).not.toContain("private-input");
    },
  );

  it("ожидает turn/start binding до исполнения callback и возвращает только текстовый JSON", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ pages: [{ id: 3, title: "Доставка" }] });
    const tools = new CodexReadTools({ definitions, execute });
    const pending = tools.handleRequest("item/tool/call", params);
    await Promise.resolve();
    expect(execute).not.toHaveBeenCalled();
    tools.bind(params.threadId, params.turnId);
    expect(await pending).toEqual({
      success: true,
      contentItems: [
        {
          type: "inputText",
          text: JSON.stringify({ pages: [{ id: 3, title: "Доставка" }] }),
        },
      ],
    });
    expect(execute).toHaveBeenCalledWith({
      name: params.tool,
      callID: params.callId,
      arguments: params.arguments,
    });
  });

  it.each([
    { tool: "pages_write" },
    { threadId: "foreign-thread" },
    { turnId: "foreign-turn" },
    { namespace: "untrusted" },
    { callId: "" },
    { arguments: undefined },
    { arguments: { query: "я".repeat(8192) } },
    { callbackURL: "http://private-host" },
  ])(
    "отклоняет неизвестные или чужие аргументы протокола %j",
    async (override) => {
      const { tools, execute } = boundTools();
      await expect(
        tools.handleRequest("item/tool/call", { ...params, ...override }),
      ).rejects.toThrow("codex_read_tool_forbidden");
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it("не повторяет callID и прекращает исполнять callback после закрытия turn", async () => {
    const { tools, execute } = boundTools();
    await tools.handleRequest("item/tool/call", params);
    await expect(
      tools.handleRequest("item/tool/call", params),
    ).rejects.toThrow();
    tools.close();
    await expect(
      tools.handleRequest("item/tool/call", { ...params, callId: "next" }),
    ).rejects.toThrow();
    expect(execute).toHaveBeenCalledOnce();
  });

  it("ограничивает число callback одного turn", async () => {
    const { tools, execute } = boundTools();
    for (let index = 0; index < 16; index++)
      await tools.handleRequest("item/tool/call", {
        ...params,
        callId: String(index),
      });
    await expect(
      tools.handleRequest("item/tool/call", { ...params, callId: "overflow" }),
    ).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(16);
  });

  it("ограничивает параллельные обращения до запуска callback", async () => {
    const execute = vi.fn().mockImplementation(() => new Promise(() => {}));
    const { tools } = boundTools(execute);
    vi.useFakeTimers();
    const pending = Array.from({ length: 4 }, (_, index) =>
      tools.handleRequest("item/tool/call", {
        ...params,
        callId: String(index),
      }),
    );
    await expect(
      tools.handleRequest("item/tool/call", { ...params, callId: "overflow" }),
    ).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(
      (await Promise.all(pending)).every((result) => result.success === false),
    ).toBe(true);
  });

  it("скрывает ошибку callback и слишком большой ответ, сохраняя корректный tool response", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error("private-credential"))
      .mockResolvedValueOnce({ body: "я".repeat(70_000) });
    const { tools } = boundTools(execute);
    const first = await tools.handleRequest("item/tool/call", params);
    const second = await tools.handleRequest("item/tool/call", {
      ...params,
      callId: "second",
    });
    expect(first.success).toBe(false);
    expect(second.success).toBe(false);
    expect(JSON.stringify([first, second])).not.toContain("private-credential");
  });

  it("не разделяет mutable definitions с владельцем и запрещает дублирование имён", () => {
    const source = structuredClone(definitions);
    const tools = new CodexReadTools({ definitions: source, execute: vi.fn() });
    source[0].name = "pages_write";
    expect(tools.definitions[0].name).toBe("pages_search");
    expect(
      () =>
        new CodexReadTools({
          definitions: [...definitions, ...definitions],
          execute: vi.fn(),
        }),
    ).toThrow();
  });
});

describe("RPC server request allowlist", () => {
  it("передаёт отказ Pages ACL как неуспешный tool response с безопасным объяснением без securityViolation", async () => {
    const { JsonLineRPCClient } = await vi.importActual<
      typeof import("../../packages/codex-adapter/src/JsonLineRpcClient.adapter")
    >("../../packages/codex-adapter/src/JsonLineRpcClient.adapter");
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    rpc.spawn.mockReturnValue(child);
    const refusal = {
      ok: false,
      error: {
        message:
          "Page access is currently unavailable for this administrator or run.",
      },
    };
    const { tools, execute } = boundTools(vi.fn().mockResolvedValue(refusal));
    const client = new JsonLineRPCClient({
      workingDirectory: "/snapshot",
      environment: { NODE_ENV: "test", CODEX_HOME: "/fixture-profile" },
      onRequest: tools.handleRequest.bind(tools),
    });
    const output: string[] = [];
    child.stdin.on("data", (data) => output.push(String(data)));
    client.start();
    const next = client.getNotifications()[Symbol.asyncIterator]().next();
    child.stdout.write(
      [
        JSON.stringify({ id: 77, method: "item/tool/call", params }),
        JSON.stringify({
          method: "turn/completed",
          params: { turn: { status: "completed" } },
        }),
        "",
      ].join("\n"),
    );
    expect((await next).value).toHaveProperty("method", "turn/completed");
    expect(execute).toHaveBeenCalledOnce();
    expect(JSON.parse(output[0])).toEqual({
      id: 77,
      result: {
        success: false,
        contentItems: [{ type: "inputText", text: JSON.stringify(refusal) }],
      },
    });
    const closed = client.close();
    child.emit("close");
    await closed;
  });

  it("проводит разрешённое чтение через JSONL и не теряет штатное завершение", async () => {
    const { JsonLineRPCClient } = await vi.importActual<
      typeof import("../../packages/codex-adapter/src/JsonLineRpcClient.adapter")
    >("../../packages/codex-adapter/src/JsonLineRpcClient.adapter");
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    rpc.spawn.mockReturnValue(child);
    const { tools, execute } = boundTools();
    const client = new JsonLineRPCClient({
      workingDirectory: "/snapshot",
      environment: { NODE_ENV: "test", CODEX_HOME: "/fixture-profile" },
      onRequest: tools.handleRequest.bind(tools),
    });
    const output: string[] = [];
    child.stdin.on("data", (data) => output.push(String(data)));
    client.start();
    const next = client.getNotifications()[Symbol.asyncIterator]().next();
    child.stdout.write(
      [
        JSON.stringify({ id: 77, method: "item/tool/call", params }),
        JSON.stringify({
          method: "turn/completed",
          params: { turn: { status: "completed" } },
        }),
        "",
      ].join("\n"),
    );
    expect((await next).value).toHaveProperty("method", "turn/completed");
    expect(execute).toHaveBeenCalledOnce();
    expect(JSON.parse(output[0])).toEqual({
      id: 77,
      result: {
        success: true,
        contentItems: [{ type: "inputText", text: '{"pages":[]}' }],
      },
    });
    const closed = client.close();
    child.emit("close");
    await closed;
  });

  it("отказ async callback имеет приоритет перед turn/completed из того же chunk", async () => {
    const { JsonLineRPCClient } = await vi.importActual<
      typeof import("../../packages/codex-adapter/src/JsonLineRpcClient.adapter")
    >("../../packages/codex-adapter/src/JsonLineRpcClient.adapter");
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    rpc.spawn.mockReturnValue(child);
    const { tools, execute } = boundTools();
    const client = new JsonLineRPCClient({
      workingDirectory: "/snapshot",
      environment: { NODE_ENV: "test", CODEX_HOME: "/fixture-profile" },
      onRequest: tools.handleRequest.bind(tools),
    });
    client.start();
    const next = client.getNotifications()[Symbol.asyncIterator]().next();
    child.stdout.write(
      [
        JSON.stringify({
          id: 77,
          method: "item/tool/call",
          params: { ...params, turnId: "foreign-turn" },
        }),
        JSON.stringify({
          method: "turn/completed",
          params: { turn: { status: "completed" } },
        }),
        "",
      ].join("\n"),
    );
    expect((await next).value).toHaveProperty(
      "method",
      "realize/securityViolation",
    );
    expect(execute).not.toHaveBeenCalled();
    const closed = client.close();
    child.emit("close");
    await closed;
  });

  it.each([
    "item/commandExecution/requestApproval",
    "item/tool/requestUserInput",
    "unknown/request",
    "item/tool/call",
  ])(
    "завершает run при запрещённом server request или ошибке обработчика: %s",
    async (method) => {
      const { JsonLineRPCClient } = await vi.importActual<
        typeof import("../../packages/codex-adapter/src/JsonLineRpcClient.adapter")
      >("../../packages/codex-adapter/src/JsonLineRpcClient.adapter");
      const child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      });
      rpc.spawn.mockReturnValue(child);
      const onRequest = vi
        .fn()
        .mockRejectedValue(new Error("private-handler-error"));
      const options: JsonLineRPCClientOptions = {
        workingDirectory: "/snapshot",
        environment: { NODE_ENV: "test", CODEX_HOME: "/fixture-profile" },
        onRequest,
      };
      const client = new JsonLineRPCClient(options);
      const output: string[] = [];
      child.stdin.on("data", (data) => output.push(String(data)));
      client.start();
      const next = client.getNotifications()[Symbol.asyncIterator]().next();
      child.stdout.write(`${JSON.stringify({ id: 77, method, params })}\n`);
      expect((await next).value).toMatchObject({
        method: "realize/securityViolation",
      });
      expect(onRequest).toHaveBeenCalledTimes(
        method === "item/tool/call" ? 1 : 0,
      );
      expect(output.join("")).not.toContain("private-handler-error");
      expect(JSON.parse(output[0])).toHaveProperty("error");
      const closed = client.close();
      child.emit("close");
      await closed;
    },
  );
});
