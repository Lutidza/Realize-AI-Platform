/**
 * @file tests/int/OpenAICodexChatContext.int.spec.ts
 * @version 1.0.3
 * @date 2026-09-16
 * @description Проверяет native images, изоляцию веб-поиска и источники ответа без обращения к модели.
 */

// @vitest-environment node

import { link, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AgentEvent, RunTurnInput } from "@realize/ai-contracts";
import { CHAT_ATTACHMENT_LIMITS } from "@realize/ai-contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RPCMessage } from "../../packages/codex-adapter/src/protocol";

const rpc = vi.hoisted(() => ({
  create: vi.fn(),
  request: vi.fn(),
  close: vi.fn(),
  notifications: [] as RPCMessage[],
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
      for (const message of rpc.notifications) yield message;
    }
  },
}));

import { OpenAICodexAdapter } from "../../packages/codex-adapter/src/OpenAICodexAdapter";
import { collectCodexChatSources } from "../../packages/codex-adapter/src/collectCodexChatSources.mapper";

const input: RunTurnInput = {
  cwd: "/fixture-snapshot",
  developerInstructions: "fixture-policy",
  prompt: "fixture request",
  runID: "fixture-run",
};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/K1cAAAAASUVORK5CYII=",
  "base64",
);
const directories: string[] = [];
const collect = async (
  value: RunTurnInput,
  environment?: NodeJS.ProcessEnv,
) => {
  const events: AgentEvent[] = [];
  for await (const event of new OpenAICodexAdapter({
    environment: {
      NODE_ENV: "test",
      CODEX_HOME: join(dirname(input.cwd), "profile"),
      ...environment,
    },
    codexBinary: process.execPath,
  }).runTurn(value))
    events.push(event);
  return events;
};
const snapshot = async () => {
  const directory = await mkdtemp(join(tmpdir(), "realize-codex-images-"));
  directories.push(directory);
  const cwd = join(directory, "snapshot");
  await mkdir(cwd);
  await mkdir(join(directory, "profile"));
  const path = join(cwd, "image.png");
  await writeFile(path, png);
  return { cwd, directory, path };
};

beforeEach(async () => {
  input.cwd = (await snapshot()).cwd;
  rpc.create.mockReset();
  rpc.close.mockReset().mockResolvedValue(undefined);
  rpc.request
    .mockReset()
    .mockImplementation(async (method: string) =>
      method.startsWith("thread/")
        ? { thread: { id: "fixture-thread" } }
        : method === "turn/start"
          ? { turn: { id: "fixture-turn" } }
          : {},
    );
  rpc.notifications = [
    {
      method: "turn/completed",
      params: {
        threadId: "fixture-thread",
        turn: {
          id: "fixture-turn",
          status: "completed",
          items: [{ type: "agentMessage", text: "fixture answer" }],
        },
      },
    },
  ];
});
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe("Codex chat context policy", () => {
  it("сохраняет legacy text-only turn и отключает web_search в процессе и thread", async () => {
    expect((await collect(input)).at(-1)).toEqual({
      type: "assistant.completed",
      content: "fixture answer",
    });
    expect(rpc.create).toHaveBeenCalledWith(
      expect.objectContaining({ webSearch: "disabled" }),
    );
    expect(rpc.request).toHaveBeenCalledWith(
      "thread/start",
      expect.objectContaining({
        sandbox: "read-only",
        approvalPolicy: "never",
        config: { web_search: "disabled" },
      }),
    );
    expect(rpc.request).toHaveBeenCalledWith("turn/start", {
      approvalPolicy: "never",
      threadId: "fixture-thread",
      input: [{ type: "text", text: input.prompt, text_elements: [] }],
    });
  });

  it.each([undefined, "fixture-existing-thread"])(
    "включает web_search только для явного чата при thread %s и сохраняет WIF deny",
    async (threadID) => {
      const protectedDirectory = join(input.cwd, "protected");
      await mkdir(protectedDirectory);
      const environment: NodeJS.ProcessEnv = {
        NODE_ENV: "test",
        OPENAI_FEDERATION_RULE_ID: "idpm_fixture",
        OPENAI_IDENTITY_TOKEN_FILE: join(protectedDirectory, "identity"),
      };
      await collect(
        {
          ...input,
          sandboxProfile: "analysis-readonly",
          webSearch: true,
          threadID,
        },
        environment,
      );
      expect(rpc.create).toHaveBeenCalledWith(
        expect.objectContaining({ webSearch: "live" }),
      );
      const call = rpc.request.mock.calls.find(
        ([method]) => method === (threadID ? "thread/resume" : "thread/start"),
      );
      expect(call?.[1]).toMatchObject({
        approvalPolicy: "never",
        config: {
          web_search: "live",
          default_permissions: "realize_chat_snapshot",
          permissions: {
            realize_chat_snapshot: {
              filesystem: {
                ":root": "deny",
                ":minimal": "read",
                [input.cwd]: "read",
                [protectedDirectory]: "deny",
              },
              network: { enabled: false },
            },
          },
        },
      });
      expect(call?.[1]).not.toHaveProperty("sandbox");
      expect(call?.[1]).not.toHaveProperty("permissions");
    },
  );

  it("при resume снова отключает прежнюю sticky web_search настройку", async () => {
    await collect({
      ...input,
      sandboxProfile: "analysis-readonly",
      threadID: "fixture-web-thread",
      webSearch: false,
    });
    expect(rpc.request).toHaveBeenCalledWith(
      "thread/resume",
      expect.objectContaining({
        config: expect.objectContaining({
          web_search: "disabled",
          default_permissions: "realize_chat_snapshot",
        }),
        approvalPolicy: "never",
      }),
    );
  });

  it.each([undefined, "code-workspace-write", "review-readonly"] as const)(
    "запрещает webSearch=true до запуска RPC для %s",
    async (sandboxProfile) => {
      expect(
        (await collect({ ...input, sandboxProfile, webSearch: true })).at(-1)
          ?.type,
      ).toBe("run.failed");
      expect(rpc.create).not.toHaveBeenCalled();
      expect(rpc.request).not.toHaveBeenCalled();
    },
  );

  it.each(["item/started", "item/completed", "turn/completed"])(
    "блокирует неожиданный native webSearch при %s",
    async (method) => {
      const item = {
        type: "webSearch",
        id: "fixture-search",
        query: "private-query",
      };
      rpc.notifications = [
        {
          method,
          params:
            method === "turn/completed"
              ? { turn: { status: "completed", items: [item] } }
              : { item },
        },
      ];
      const events = await collect({
        ...input,
        sandboxProfile: "review-readonly",
      });
      expect(events.at(-1)?.type).toBe("run.failed");
      expect(JSON.stringify(events)).not.toContain("private-query");
      expect(events.some((event) => event.type === "assistant.completed")).toBe(
        false,
      );
      expect(rpc.close).toHaveBeenCalledOnce();
    },
  );

  it("нормализует web lifecycle и возвращает реальные источники из native results и actions", async () => {
    const item = {
      type: "webSearch",
      id: "fixture-search",
      query: "private-query",
      action: { type: "openPage", url: "https://docs.example.test/page" },
      results: [
        { url: "https://docs.example.test/page", title: "Документация" },
        { url: "javascript:alert(1)" },
      ],
    };
    rpc.notifications = [
      {
        method: "item/started",
        params: { item, threadId: "fixture-thread", turnId: "fixture-turn" },
      },
      {
        method: "item/completed",
        params: { item, threadId: "fixture-thread", turnId: "fixture-turn" },
      },
      {
        method: "turn/completed",
        params: {
          threadId: "fixture-thread",
          turn: {
            id: "fixture-turn",
            status: "completed",
            items: [
              {
                type: "webSearch",
                id: "fixture-find",
                query: "",
                action: {
                  type: "findInPage",
                  url: "https://reference.example.test/guide",
                  pattern: "private-query",
                },
              },
              { type: "agentMessage", text: "fixture final" },
            ],
          },
        },
      },
    ];
    const events = await collect({
      ...input,
      sandboxProfile: "analysis-readonly",
      webSearch: true,
    });
    expect(events.filter((event) => event.type.startsWith("tool."))).toEqual([
      { type: "tool.started", summary: expect.any(String) },
      {
        type: "tool.completed",
        summary: expect.any(String),
        status: "completed",
      },
    ]);
    expect(events.at(-1)).toEqual({
      type: "assistant.completed",
      content: "fixture final",
      sources: [
        { url: "https://docs.example.test/page", title: "Документация" },
        { url: "https://reference.example.test/guide" },
      ],
    });
    expect(JSON.stringify(events)).not.toContain("private-query");
  });

  it("сериализует проверенное изображение штатным localImage рядом с текстом", async () => {
    const file = await snapshot();
    await collect({ ...input, cwd: file.cwd, images: [{ path: file.path }] });
    expect(rpc.request).toHaveBeenCalledWith("turn/start", {
      approvalPolicy: "never",
      threadId: "fixture-thread",
      input: [
        { type: "text", text: input.prompt, text_elements: [] },
        { type: "localImage", path: file.path },
      ],
    });
  });

  it.each([
    "relative",
    "outside",
    "traversal",
    "file-symlink",
    "parent-symlink",
    "hardlink",
    "directory",
    "nonimage",
    "oversized",
  ])("отклоняет image %s до запуска Codex без раскрытия пути", async (kind) => {
    const file = await snapshot();
    let path = file.path;
    if (kind === "relative") path = "image.png";
    if (kind === "outside") {
      path = join(file.directory, "outside.png");
      await writeFile(path, png);
    }
    if (kind === "traversal") path = `${file.cwd}/../snapshot/image.png`;
    if (kind === "file-symlink") {
      path = join(file.cwd, "link.png");
      await symlink(file.path, path);
    }
    if (kind === "parent-symlink") {
      await symlink(file.cwd, join(file.cwd, "link-dir"));
      path = join(file.cwd, "link-dir", "image.png");
    }
    if (kind === "hardlink") {
      path = join(file.cwd, "hard.png");
      await link(file.path, path);
    }
    if (kind === "directory") path = file.cwd;
    if (kind === "nonimage") await writeFile(path, "fixture-private-text");
    if (kind === "oversized")
      await writeFile(
        path,
        Buffer.alloc(CHAT_ATTACHMENT_LIMITS.maxImageBytes + 1),
      );
    const events = await collect({
      ...input,
      cwd: file.cwd,
      images: [{ path }],
    });
    expect(events.at(-1)?.type).toBe("run.failed");
    expect(rpc.create).not.toHaveBeenCalled();
    expect(JSON.stringify(events)).not.toContain(file.directory);
    expect(JSON.stringify(events)).not.toContain("fixture-private-text");
  });

  it("ограничивает число изображений до обращения к filesystem и RPC", async () => {
    const events = await collect({
      ...input,
      images: Array.from(
        { length: CHAT_ATTACHMENT_LIMITS.maxFiles + 1 },
        () => ({ path: "/fixture-private-path" }),
      ),
    });
    expect(events.at(-1)?.type).toBe("run.failed");
    expect(rpc.create).not.toHaveBeenCalled();
  });

  it("отклоняет суммарный размер изображений сверх общего лимита сообщения", async () => {
    const file = await snapshot();
    const image = Buffer.alloc(7 * 1024 * 1024);
    png.copy(image);
    const images = [];
    for (let index = 0; index < 3; index++) {
      const path = join(file.cwd, `large-${index}.png`);
      await writeFile(path, image);
      images.push({ path });
    }
    expect(
      (await collect({ ...input, cwd: file.cwd, images })).at(-1)?.type,
    ).toBe("run.failed");
    expect(rpc.create).not.toHaveBeenCalled();
  });
});

describe("Codex source projection", () => {
  it("не выводит credentials, внутренние ссылки и URLs из generated text или не-citation annotations", () => {
    const credentialURL = new URL("https://example.test/");
    credentialURL.username = "fixture-user";
    credentialURL.password = "fixture-password";
    const sourceItems = [
      {
        type: "webSearch",
        results: [
          {
            url: "https://safe.example.test/page",
            title: "Нормальный источник",
          },
          ...[
            "file:///private/file",
            "data:text/html,fixture",
            "javascript:alert(1)",
            "turn0search1",
            "/relative",
            credentialURL.toString(),
            "https://example.test/\nprivate",
            "https://example.test/with space",
          ].map((url) => ({ url })),
        ],
      },
      {
        type: "agentMessage",
        text: "https://invented.example.test/ citeturn0search1",
        annotations: [
          { type: "file_citation", url: "https://untrusted.example.test/" },
          {
            type: "url_citation",
            url_citation: {
              url: "http://second.example.test/",
              title: "Второй источник",
            },
          },
        ],
      },
    ];
    expect(collectCodexChatSources(sourceItems)).toEqual([
      { url: "https://safe.example.test/page", title: "Нормальный источник" },
      { url: "http://second.example.test/", title: "Второй источник" },
    ]);
  });
});
