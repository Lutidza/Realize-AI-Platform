/**
 * @file tests/int/mcp-git-head-tool.int.spec.ts
 * @version 1.0.2
 * @date 2026-11-26
 * @description Проверяет HTTP-контракт Git HEAD, явные grants и run-owned bridge без вызова Git.
 * @see documentation/specifications/internal-mcp.md
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { mcpToolInputs } from "../../packages/ai-contracts/src/mcpToolInputs.config";
import { mcpToolDataSchemas } from "../../packages/ai-contracts/src/mcpToolOutputs.config";
import { createMcpHttpServer } from "../../services/internal-mcp/src/createMcpHttpServer.controller";
import { availableMcpTools } from "../../services/internal-mcp/src/availableMcpTools.service";
import { executeMcpTool } from "../../services/internal-mcp/src/executeMcpTool.service";
import { mcpToolCatalog } from "../../services/internal-mcp/src/mcpToolCatalog.config";
import { McpError } from "../../services/internal-mcp/src/Mcp.error";
import type {
  McpPrincipal,
  McpRuntimeOptions,
} from "../../services/internal-mcp/src/McpRuntime.types";
import { createRepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import { RepositoryCursorService } from "../../services/ai-control-plane/src/RepositoryCursor.service";
import { RepositoryReadError } from "../../services/ai-control-plane/src/RepositoryRead.error";
import { GitFailure } from "@realize/git-runtime";

const { readHead } = vi.hoisted(() => ({ readHead: vi.fn() }));
vi.mock(
  "../../.ai/tools/git-delivery/src/read/gitRead.server.index",
  async (original) => ({
    ...(await original<object>()),
    readGitHead: readHead,
  }),
);

const metadata = {
  head: "a".repeat(40),
  branch: "main",
  detached: false,
  unborn: false,
};

describe("repo_git_head: contract и границы MCP", () => {
  let root: string;
  let credential: string;
  let principal: McpPrincipal;
  let options: McpRuntimeOptions;
  let running: Awaited<ReturnType<typeof createMcpHttpServer>>;
  const clients: Client[] = [];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "realize-head-tool-"));
    credential = randomBytes(32).toString("base64url");
    readHead.mockReset().mockResolvedValue(metadata);
    principal = {
      principalID: "head-tool-fixture",
      installationID: "fixture",
      repositoryRead: true,
      pagesRead: false,
      allowedTools: ["repo_git_head"],
      limits: {
        callsPerMinute: 60,
        burst: 10,
        concurrentCalls: 4,
        responseBytes: 131072,
      },
    };
    options = {
      port: 0,
      policy: await createRepositoryReadPolicy(root, false),
      authorize: async (token) => {
        if (token !== credential)
          throw new McpError("FORBIDDEN", "Ключ не принят.", 401);
        return { ...principal, allowedTools: [...principal.allowedTools] };
      },
      observeSearch: vi.fn(),
    };
    running = await createMcpHttpServer(options);
  });

  afterEach(async () => {
    await Promise.allSettled(clients.splice(0).map((client) => client.close()));
    await running?.close();
    await rm(root, { recursive: true, force: true });
  });

  const connect = async (era: "modern" | "legacy" = "modern") => {
    const client = new Client(
      { name: "head-tool-fixture", version: "1.0.0" },
      {
        versionNegotiation: {
          mode: era === "modern" ? { pin: "2026-07-28" } : "legacy",
        },
        supportedProtocolVersions: [
          era === "modern" ? "2026-07-28" : "2025-11-25",
        ],
      },
    );
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${running.origin}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${credential}` } },
      }),
    );
    return client;
  };

  it("принимает только пустой input и согласованные ограниченные metadata", () => {
    expect(mcpToolInputs.repo_git_head.parse({})).toEqual({});
    expect(mcpToolInputs.repo_git_head.safeParse({ path: root }).success).toBe(
      false,
    );
    for (const value of [
      metadata,
      { ...metadata, head: "b".repeat(64) },
      { ...metadata, branch: null, detached: true },
      { ...metadata, head: null, unborn: true },
    ])
      expect(mcpToolDataSchemas.repo_git_head.safeParse(value).success).toBe(
        true,
      );
    for (const value of [
      { ...metadata, head: "a".repeat(41) },
      { ...metadata, branch: "x".repeat(1025) },
      { ...metadata, branch: "main\nsecret" },
      { ...metadata, detached: true },
      { ...metadata, unborn: true },
      { ...metadata, dirty: false },
    ])
      expect(mcpToolDataSchemas.repo_git_head.safeParse(value).success).toBe(
        false,
      );
  });

  it.each(["modern", "legacy"] as const)(
    "%s получает HEAD через server owner и JSON text, без search telemetry",
    async (era) => {
      const client = await connect(era);
      const catalog = await client.listTools();
      expect(
        catalog.tools.find((tool) => tool.name === "repo_git_head")
          ?.annotations,
      ).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
      expect(mcpToolCatalog.repo_git_head).toMatchObject({
        grant: "repository:read",
        dependency: "git",
        effect: "read",
      });
      const result = await client.callTool({
        name: "repo_git_head",
        arguments: {},
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        ok: true,
        data: metadata,
      });
      const text = result.content.find((item) => item.type === "text");
      expect(text?.type).toBe("text");
      if (text?.type === "text")
        expect(JSON.parse(text.text)).toEqual(result.structuredContent);
      expect(readHead).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          policy: options.policy,
          principal: principal.principalID,
          signal: expect.any(AbortSignal),
        }),
      );
      expect(options.observeSearch).not.toHaveBeenCalled();
    },
  );

  it("не добавляет HEAD существующему explicit allowlist и требует repositoryRead", async () => {
    principal.allowedTools = ["repo_search"];
    expect(availableMcpTools(principal, options)).not.toContain(
      "repo_git_head",
    );
    await expect(
      executeMcpTool(
        "repo_git_head",
        {},
        principal,
        options,
        new RepositoryCursorService(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    principal.allowedTools = ["repo_git_head"];
    principal.repositoryRead = false;
    expect(availableMcpTools(principal, options)).not.toContain(
      "repo_git_head",
    );
    await expect(
      executeMcpTool(
        "repo_git_head",
        {},
        principal,
        options,
        new RepositoryCursorService(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(readHead).not.toHaveBeenCalled();
  });

  it("отвергает лишние поля до чтения Git", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "repo_git_head",
      arguments: { command: "status" },
    });
    expect(result.isError).toBe(true);
    expect(readHead).not.toHaveBeenCalled();
    expect(options.observeSearch).not.toHaveBeenCalled();
  });

  it("отзыв разрешения после discovery запрещает следующий вызов", async () => {
    const client = await connect();
    expect(
      (await client.listTools()).tools.some(
        (tool) => tool.name === "repo_git_head",
      ),
    ).toBe(true);
    principal.allowedTools = [];
    await expect(
      client.callTool({ name: "repo_git_head", arguments: {} }),
    ).rejects.toThrow("Tool repo_git_head not found");
    expect(readHead).not.toHaveBeenCalled();
  });

  it("run-owned repositoryTools передаёт HEAD без общего Git context и не получает дополнительные tools", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true, data: metadata });
    options.policy = undefined;
    options.repositoryTools = {
      definitions: [
        {
          name: "repo_git_head",
          description: "Прочитать HEAD.",
          inputSchema: z.toJSONSchema(mcpToolInputs.repo_git_head),
        },
      ],
      execute,
    };
    principal.allowedTools = ["repo_git_head", "repo_git_status", "pages_get"];
    const client = await connect();
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
      "repo_git_head",
    ]);
    const result = await client.callTool({
      name: "repo_git_head",
      arguments: {},
    });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      data: metadata,
    });
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      name: "repo_git_head",
      arguments: {},
      callID: expect.any(String),
    });
    expect(readHead).not.toHaveBeenCalled();
    expect(options.observeSearch).not.toHaveBeenCalled();
  });

  it.each([
    [new RepositoryReadError("TIMEOUT", "Чтение отменено."), "TIMEOUT"],
    [
      new GitFailure("GIT_FAILED", "private stderr", 128),
      "DEPENDENCY_UNAVAILABLE",
    ],
  ] as const)(
    "сохраняет безопасную причину отказа %s без search telemetry",
    async (failure, code) => {
      readHead.mockRejectedValueOnce(failure);
      const client = await connect();
      const result = await client.callTool({
        name: "repo_git_head",
        arguments: {},
      });
      expect(result).toMatchObject({
        isError: true,
        structuredContent: { ok: false, error: { code } },
      });
      expect(JSON.stringify(result)).not.toContain("private stderr");
      expect(options.observeSearch).not.toHaveBeenCalled();
    },
  );

  it("не выпускает неожиданные поля результата за wire boundary", async () => {
    readHead.mockResolvedValueOnce({ ...metadata, privatePath: root });
    const client = await connect();
    const result = await client.callTool({
      name: "repo_git_head",
      arguments: {},
    });
    expect(result).toMatchObject({
      isError: true,
      structuredContent: { ok: false, error: { code: "INTERNAL_ERROR" } },
    });
    expect(JSON.stringify(result)).not.toContain(root);
    expect(options.observeSearch).not.toHaveBeenCalled();
  });
});
