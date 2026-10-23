/**
 * @file tests/int/OpenAICodexOwnerHost.int.spec.ts
 * @version 1.1.0
 * @date 2026-10-23
 * @description Проверяет серверный допуск owner-host и сохранение изолированных политик без обращения к модели.
 */

// @vitest-environment node

import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, RunTurnInput } from "@realize/ai-contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenAICodexAdapterOptions } from "../../packages/codex-adapter/src/OpenAICodex.types";
import type { RPCMessage } from "../../packages/codex-adapter/src/protocol";

const rpc = vi.hoisted(() => ({
  create: vi.fn(),
  request: vi.fn(),
  close: vi.fn(),
  userInfo: vi.fn(),
  config: {} as Record<string, unknown>,
  notifications: [] as RPCMessage[],
}));
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  userInfo: rpc.userInfo,
}));
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
      for (const item of rpc.notifications) yield item;
    }
  },
}));
vi.mock(
  "../../packages/codex-adapter/src/createCodexChatPermissions.config",
  () => ({
    createCodexChatPermissions: async () => ({
      binaryPath: "/fixture-codex",
      profile: { filesystem: { ":root": "deny" }, network: { enabled: false } },
    }),
  }),
);
import { OpenAICodexAdapter } from "../../packages/codex-adapter/src/OpenAICodexAdapter";

let root: string;
let input: RunTurnInput;
let options: OpenAICodexAdapterOptions;
const completed = (items: unknown[] = []) => ({
  method: "turn/completed",
  params: {
    threadId: "parent",
    turn: { id: "turn", status: "completed", items },
  },
});
const collect = async (run = input, settings = options) => {
  const events: AgentEvent[] = [];
  for await (const event of new OpenAICodexAdapter(settings).runTurn(run))
    events.push(event);
  return events;
};
beforeEach(async () => {
  vi.spyOn(process, "geteuid").mockReturnValue(1000);
  root = await mkdtemp(join(tmpdir(), "realize-owner-adapter-"));
  rpc.create.mockReset();
  rpc.close.mockReset().mockResolvedValue(undefined);
  rpc.userInfo.mockReset().mockReturnValue({
    uid: 1000,
    username: "fixture-owner",
    homedir: "/home/fixture-owner",
    shell: "/bin/bash",
  });
  rpc.request
    .mockReset()
    .mockImplementation(async (method: string) =>
      method === "config/read"
        ? rpc.config
        : method === "thread/list"
          ? { data: [], nextCursor: null }
          : method.startsWith("thread/")
            ? { thread: { id: "parent" } }
            : method === "turn/start"
              ? { turn: { id: "turn" } }
              : {},
    );
  rpc.config = { config: {}, origins: {}, layers: [] };
  rpc.notifications = [completed([{ type: "agentMessage", text: "Готово." }])];
  input = {
    cwd: root,
    runID: "run",
    sandboxProfile: "owner-host",
    developerInstructions: "owner policy",
    prompt: "fixture",
  };
  options = {
    environment: { NODE_ENV: "test", CODEX_HOME: "/fixture-profile" },
    ownerHost: { workspaceRoot: root, osUser: "fixture-owner" },
  };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("Codex owner-host", () => {
  it("выбирает full-access, фактический cwd и project instructions без dynamic tools и MCP", async () => {
    const events = await collect(
      { ...input, webSearch: true, threadID: "old-isolated-thread" },
      {
        ...options,
        environment: {
          ...options.environment,
          OPENAI_FEDERATION_RULE_ID: "fixture-wif",
        },
      },
    );
    expect(events).toContainEqual({
      type: "assistant.completed",
      content: "Готово.",
    });
    expect(rpc.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerHost: options.ownerHost,
        workingDirectory: root,
        ignoreProjectInstructions: false,
        webSearch: "live",
      }),
    );
    expect(rpc.create.mock.calls[0][0].onRequest).toBeUndefined();
    expect(rpc.request).toHaveBeenCalledWith(
      "thread/start",
      expect.objectContaining({
        approvalPolicy: "never",
        cwd: root,
        config: {
          default_permissions: ":danger-full-access",
          web_search: "live",
          mcp_servers: {},
        },
      }),
    );
    expect(
      rpc.request.mock.calls.find(([method]) => method === "thread/start")?.[1]
        .dynamicTools,
    ).toBeUndefined();
    expect(
      rpc.request.mock.calls.some(([method]) => method === "thread/resume"),
    ).toBe(false);
  });

  it.each([
    "analysis-readonly",
    "review-readonly",
    "code-workspace-write",
  ] as const)("сохраняет прежнюю политику %s", async (sandboxProfile) => {
    await collect(
      { ...input, sandboxProfile },
      { environment: options.environment },
    );
    expect(rpc.create.mock.calls[0][0]).toMatchObject({
      ignoreProjectInstructions: true,
    });
    expect(rpc.create.mock.calls[0][0].ownerHost).toBeUndefined();
    const thread = rpc.request.mock.calls.find(
      ([method]) => method === "thread/start",
    )?.[1];
    if (sandboxProfile === "analysis-readonly")
      expect(thread.config.default_permissions).toBe("realize_chat_snapshot");
    else
      expect(thread.sandbox).toBe(
        sandboxProfile === "review-readonly" ? "read-only" : "workspace-write",
      );
  });

  it.each([
    "missing",
    "root",
    "other-user",
    "wrong-root",
    "unknown-profile",
    "bridge",
    "read-tools",
    "profile-mismatch",
  ])("отклоняет %s до создания процесса", async (kind) => {
    if (kind === "missing") options.ownerHost = undefined;
    if (kind === "root")
      rpc.userInfo.mockReturnValue({
        uid: 0,
        username: "root",
        homedir: "/root",
        shell: "/bin/bash",
      });
    if (kind === "other-user") options.ownerHost!.osUser = "someone-else";
    if (kind === "wrong-root") options.ownerHost!.workspaceRoot = "/other-root";
    if (kind === "unknown-profile")
      input.sandboxProfile = "unknown" as RunTurnInput["sandboxProfile"];
    if (kind === "bridge")
      options.repositoryMcpURL = "http://127.0.0.1:43111/mcp";
    if (kind === "read-tools")
      options.readTools = { definitions: [], execute: vi.fn() };
    if (kind === "profile-mismatch") input.sandboxProfile = "review-readonly";
    expect(await collect()).toEqual([
      expect.objectContaining({ type: "run.failed" }),
    ]);
    expect(rpc.create).not.toHaveBeenCalled();
  });

  it("отклоняет cwd-алиас на symlink даже при совпавшем workspaceRoot", async () => {
    const alias = join(root, "alias");
    await symlink(root, alias);
    input.cwd = alias;
    options.ownerHost!.workspaceRoot = alias;
    expect(await collect()).toEqual([
      expect.objectContaining({ type: "run.failed" }),
    ]);
    expect(rpc.create).not.toHaveBeenCalled();
  });

  it("проверяет private attachments отдельно от настоящего cwd проекта", async () => {
    const attachments = await mkdtemp(
      join(tmpdir(), "realize-owner-attachments-"),
    );
    try {
      const imagePath = join(attachments, "image.png");
      await writeFile(
        imagePath,
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      options.ownerHost!.attachmentRoot = attachments;
      input.images = [{ path: imagePath }];
      expect(await collect()).toContainEqual(
        expect.objectContaining({ type: "assistant.completed" }),
      );
      expect(rpc.create.mock.calls[0][0].workingDirectory).toBe(root);
      expect(rpc.request).toHaveBeenCalledWith(
        "turn/start",
        expect.objectContaining({
          input: [
            { text: input.prompt, text_elements: [], type: "text" },
            { type: "localImage", path: imagePath },
          ],
        }),
      );
      delete options.ownerHost!.attachmentRoot;
      expect(await collect()).toEqual([
        expect.objectContaining({ type: "run.failed" }),
      ]);
    } finally {
      await rm(attachments, { recursive: true, force: true });
    }
  });

  it("завершает только подтверждённые native descendants и оставляет usage partial", async () => {
    options.search = {
      enabled: true,
      mode: "subagent",
      model: "fixture-search-model",
      developerInstructions: false,
    };
    rpc.request.mockImplementation(async (method: string) =>
      method === "config/read"
        ? rpc.config
        : method === "thread/list"
          ? {
              data: [
                {
                  id: "native-child",
                  parentThreadId: "parent",
                  status: { type: "idle" },
                },
              ],
              nextCursor: null,
            }
          : method.startsWith("thread/")
            ? { thread: { id: "parent" } }
            : method === "turn/start"
              ? { turn: { id: "turn" } }
              : {},
    );
    const usage = {
      inputTokens: 10,
      cachedInputTokens: 0,
      outputTokens: 3,
      reasoningOutputTokens: 0,
      totalTokens: 13,
    };
    rpc.notifications = [
      {
        method: "thread/tokenUsage/updated",
        params: {
          threadId: "native-child",
          turnId: "child-turn",
          tokenUsage: { last: usage, total: usage },
        },
      },
      {
        method: "thread/tokenUsage/updated",
        params: {
          threadId: "parent",
          turnId: "turn",
          tokenUsage: { last: usage, total: usage },
        },
      },
      completed([{ type: "agentMessage", text: "Готово." }]),
    ];
    const events = await collect();
    const measurements = events.filter(
      (event) => event.type === "usage.measured",
    );
    expect(measurements).toHaveLength(1);
    expect(measurements[0]).toMatchObject({
      measurement: {
        coverage: "partial",
        providerThreadId: "parent",
        providerTurnId: "turn",
      },
    });
    expect(rpc.request).toHaveBeenCalledWith(
      "initialize",
      expect.objectContaining({ capabilities: { experimentalApi: true } }),
    );
    expect(rpc.request).toHaveBeenCalledWith("thread/list", {
      ancestorThreadId: "parent",
      limit: 5,
    });
    expect(rpc.request).toHaveBeenCalledWith("thread/archive", {
      threadId: "native-child",
    });
  });

  it("разрешает native command/fileChange и webSearch, но сохраняет запрет CMS/MCP", async () => {
    rpc.notifications = [
      {
        method: "item/started",
        params: {
          threadId: "parent",
          turnId: "turn",
          item: { type: "commandExecution" },
        },
      },
      completed([
        { type: "fileChange" },
        { type: "webSearch" },
        { type: "agentMessage", text: "Готово." },
      ]),
    ];
    expect(await collect({ ...input, webSearch: true })).not.toContainEqual(
      expect.objectContaining({ type: "run.failed" }),
    );
    rpc.notifications = [
      completed([{ type: "mcpToolCall", server: "cms", tool: "pages_update" }]),
    ];
    expect(await collect()).toContainEqual(
      expect.objectContaining({ type: "run.failed" }),
    );
  });

  it("при cancel закрывает transport после interrupt до ожидания остальных событий", async () => {
    const adapter = new OpenAICodexAdapter(options);
    const iterator = adapter.runTurn(input)[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toEqual({
      type: "run.started",
      threadID: "parent",
    });
    await adapter.cancelRun(input.runID);
    expect(rpc.request).toHaveBeenCalledWith("turn/interrupt", {
      threadId: "parent",
      turnId: "turn",
    });
    expect(rpc.close).toHaveBeenCalled();
    expect((await iterator.next()).value).toEqual({ type: "run.cancelled" });
    await iterator.return?.();
  });

  const trustedMcp = () => {
    options.ownerHost!.trustedProjectMcp = true;
    const name = { type: "project", dotCodexFolder: join(root, ".codex") };
    const config = {
      mcp_servers: {
        "fixture-project": { command: "fixture", disabled_tools: ["blocked"] },
      },
    };
    rpc.config = {
      config,
      origins: {
        "mcp_servers.fixture-project.command": {
          name,
          version: "fixture-version",
        },
        "mcp_servers.fixture-project.disabled_tools.0": {
          name,
          version: "fixture-version",
        },
      },
      layers: [{ config, name, version: "fixture-version" }],
    };
  };
  const mcpItem = (overrides: Record<string, unknown> = {}) => ({
    type: "mcpToolCall",
    server: "fixture-project",
    tool: "new_project_tool",
    status: "completed",
    arguments: { syntheticSecret: "must-not-leak" },
    result: { content: "must-not-leak" },
    ...overrides,
  });

  it("разрешает подтверждённый project MCP без hardcoded tools и не публикует arguments/results", async () => {
    trustedMcp();
    rpc.notifications = [
      {
        method: "item/started",
        params: { threadId: "parent", turnId: "turn", item: mcpItem() },
      },
      {
        method: "item/completed",
        params: { threadId: "parent", turnId: "turn", item: mcpItem() },
      },
      completed([mcpItem(), { type: "agentMessage", text: "Готово." }]),
    ];
    const events = await collect();
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: "run.failed" }),
    );
    expect(events).toContainEqual({
      type: "tool.started",
      summary: "MCP fixture-project/new_project_tool: вызов начат.",
    });
    expect(events).toContainEqual({
      type: "tool.completed",
      status: "completed",
      summary: "MCP fixture-project/new_project_tool: вызов завершён.",
    });
    expect(JSON.stringify(events)).not.toContain("must-not-leak");
    expect(rpc.request).toHaveBeenCalledWith("config/read", {
      cwd: root,
      includeLayers: true,
    });
    expect(rpc.request).toHaveBeenCalledWith(
      "thread/start",
      expect.objectContaining({
        config: expect.objectContaining({
          mcp_servers: (rpc.config.config as Record<string, unknown>)
            .mcp_servers,
        }),
      }),
    );
  });

  it.each(["item/started", "item/completed", "turn/completed"])(
    "блокирует неизвестный MCP в %s, в том числе дочерний",
    async (method) => {
      trustedMcp();
      const item = mcpItem({ server: "untrusted" });
      rpc.notifications = [
        method === "turn/completed"
          ? completed([item])
          : {
              method,
              params: { threadId: "child", turnId: "child-turn", item },
            },
      ];
      expect(await collect()).toContainEqual({
        type: "run.failed",
        message: "Запрещён MCP-инструмент: untrusted/new_project_tool.",
      });
      expect(rpc.close).toHaveBeenCalled();
    },
  );

  it.each([
    { result: { isError: true } },
    { error: { message: "must-not-leak" } },
  ])(
    "показывает ошибку owner MCP при завершённом transport %j",
    async (overrides) => {
      trustedMcp();
      rpc.notifications = [
        {
          method: "item/completed",
          params: {
            threadId: "parent",
            turnId: "turn",
            item: mcpItem(overrides),
          },
        },
        completed(),
      ];
      const events = await collect();
      expect(events).toContainEqual({
        type: "tool.completed",
        status: "failed",
        summary: "MCP fixture-project/new_project_tool: вызов завершён.",
      });
      expect(JSON.stringify(events)).not.toContain("must-not-leak");
    },
  );

  it.each([
    { tool: "blocked" },
    { pluginId: "external-plugin" },
    { appContext: { connectorId: "external-connector" } },
    { tool: "invalid\nname" },
  ])("отклоняет tool restrictions и внешние sources %j", async (overrides) => {
    trustedMcp();
    rpc.notifications = [completed([mcpItem(overrides)])];
    expect(await collect()).toContainEqual(
      expect.objectContaining({ type: "run.failed" }),
    );
  });

  it("без отдельного MCP допуска поимённо отключает унаследованный сервер до turn", async () => {
    trustedMcp();
    delete options.ownerHost!.trustedProjectMcp;
    await collect();
    expect(rpc.request).toHaveBeenCalledWith(
      "thread/start",
      expect.objectContaining({
        config: expect.objectContaining({
          mcp_servers: { "fixture-project": { enabled: false } },
        }),
      }),
    );
  });

  it("отказывает при чужом provenance до thread/start и model turn", async () => {
    trustedMcp();
    (rpc.config.origins as Record<string, unknown>)[
      "mcp_servers.fixture-project.command"
    ] = {
      name: { type: "user", file: "/profile/config.toml" },
      version: "fixture-version",
    };
    expect(await collect()).toContainEqual(
      expect.objectContaining({ type: "run.failed" }),
    );
    expect(
      rpc.request.mock.calls.some(
        ([method]) => method === "thread/start" || method === "turn/start",
      ),
    ).toBe(false);
  });

  it.each([
    "analysis-readonly",
    "review-readonly",
    "code-workspace-write",
  ] as const)("оставляет MCP закрытым для %s", async (sandboxProfile) => {
    rpc.notifications = [completed([mcpItem()])];
    expect(
      await collect(
        { ...input, sandboxProfile },
        { environment: options.environment },
      ),
    ).toContainEqual(expect.objectContaining({ type: "run.failed" }));
    expect(
      rpc.request.mock.calls.some(([method]) => method === "config/read"),
    ).toBe(false);
  });

  it("сигнал отмены owner-host не превращает ошибку закрытого RPC в run.failed", async () => {
    const controller = new AbortController();
    options.signal = controller.signal;
    rpc.request.mockImplementation(async () => {
      controller.abort();
      throw new Error("codex_aborted");
    });
    expect(await collect()).toEqual([{ type: "run.cancelled" }]);
    expect(rpc.close).toHaveBeenCalled();
  });
});
