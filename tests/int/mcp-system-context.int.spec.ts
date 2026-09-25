/**
 * @file tests/int/mcp-system-context.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-24
 * @description Проверяет S1 настоящими MCP SDK clients, отзыв grants и прямой fallback без listener.
 */
// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHttpServer } from "../../services/internal-mcp/src/createMcpHttpServer.controller";
import { createRepositoryReadPolicy } from "../../services/ai-control-plane/src/repositoryReadPolicy.validator";
import {
  AI_INSTRUCTION_CORE,
  AI_INSTRUCTION_PROFILES,
} from "../../services/ai-control-plane/src/aiInstructionSources.config";
import {
  aiContextOutputSchema,
  aiCapabilitiesOutputSchema,
} from "../../packages/ai-contracts/src/aiInstructionOutputs.config";
import { mcpToolDataSchemas } from "../../packages/ai-contracts/src/mcpToolOutputs.config";
import { MCP_REALIZE_TOOLS } from "../../packages/ai-contracts/src/mcpServer.config";
import type {
  McpPrincipal,
  McpRuntimeOptions,
} from "../../services/internal-mcp/src/McpRuntime.types";
import { McpError } from "../../services/internal-mcp/src/Mcp.error";

describe("S1: protocol, actual availability и отзыв доступа", () => {
  let root: string;
  let principal: McpPrincipal;
  let options: McpRuntimeOptions;
  let running: Awaited<ReturnType<typeof createMcpHttpServer>>;
  let credential: string;
  let revoked: boolean;
  const clients: Client[] = [];
  const write = async (path: string, value: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), value);
  };
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "realize-s1-sdk-"));
    credential = randomBytes(32).toString("base64url");
    revoked = false;
    for (const path of new Set([
      ...AI_INSTRUCTION_CORE,
      ...AI_INSTRUCTION_PROFILES.backend,
    ]))
      await write(path, `# ${path}\nОбязательные инструкции проекта.\n`);
    await write("src/valid.ts", "export const value = 1;\n");
    principal = {
      principalID: "s1-fixture",
      installationID: "s1-fixture",
      repositoryRead: true,
      pagesRead: false,
      allowedTools: [...MCP_REALIZE_TOOLS],
      limits: {
        callsPerMinute: 120,
        burst: 30,
        concurrentCalls: 4,
        responseBytes: 131072,
      },
    };
    options = {
      port: 0,
      policy: await createRepositoryReadPolicy(root, true),
      authorize: async (token) => {
        if (revoked || token !== credential)
          throw new McpError("FORBIDDEN", "Credential отозван.", 401);
        return { ...principal, allowedTools: [...principal.allowedTools] };
      },
    };
    running = await createMcpHttpServer(options);
  });
  afterEach(async () => {
    await Promise.allSettled(clients.splice(0).map((client) => client.close()));
    await running.close();
    await rm(root, { recursive: true, force: true });
    await rm(`${root}-offline`, { recursive: true, force: true });
  });
  const connect = async (era: "modern" | "legacy" = "modern") => {
    const client = new Client(
      { name: "s1-fixture", version: "1.0.0" },
      {
        versionNegotiation: {
          mode: era === "modern" ? { pin: "2026-07-28" } : "legacy",
        },
        supportedProtocolVersions:
          era === "modern" ? ["2026-07-28"] : ["2025-11-25"],
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
  const contextOf = async (client: Client) => {
    const result = await client.callTool({
      name: "ai_context_resolve",
      arguments: {
        description: "Проверить backend",
        kind: "backend",
        targetPaths: ["src/valid.ts"],
      },
    });
    expect(result.isError).not.toBe(true);
    return aiContextOutputSchema.parse(
      (result.structuredContent as { data: unknown }).data,
    );
  };
  const capabilitiesOf = async (client: Client) => {
    const result = await client.callTool({
      name: "ai_capabilities_list",
      arguments: {},
    });
    expect(result.isError).not.toBe(true);
    return aiCapabilitiesOutputSchema.parse(
      (result.structuredContent as { data: unknown }).data,
    );
  };

  it.each(["modern", "legacy"] as const)(
    "%s получает контекст, точные инструкции и каталог реальных registrations",
    async (era) => {
      const client = await connect(era);
      const registered = await client.listTools();
      const context = await contextOf(client);
      const agents = context.sources.find(
        (source) => source.path === "AGENTS.md",
      )!;
      const reply = await client.callTool({
        name: "ai_instructions_get",
        arguments: { path: agents.path, expectedSha256: agents.sha256 },
      });
      const instruction = mcpToolDataSchemas.ai_instructions_get.parse(
        (reply.structuredContent as { data: unknown }).data,
      );
      expect(instruction.text).toBe(
        await readFile(join(root, "AGENTS.md"), "utf8"),
      );
      expect(instruction.authority).toBe("project");
      expect(instruction.grantsPermissions).toBe(false);
      const capabilities = await capabilitiesOf(client);
      expect(capabilities.tools.map((tool) => tool.name)).toEqual(
        registered.tools.map((tool) => tool.name),
      );
      expect(
        capabilities.tools.find((tool) => tool.name === "ai_context_resolve")
          ?.availability,
      ).toBe("available");
      expect(
        capabilities.tools.find((tool) => tool.name === "repo_git_status")
          ?.availability,
      ).toBe("unavailable");
      expect(
        capabilities.tools.some((tool) => tool.name.startsWith("pages_")),
      ).toBe(false);
    },
  );

  it("обновляет policy после read и отказывает старому expected hash", async () => {
    const client = await connect();
    const initial = await contextOf(client);
    const agents = initial.sources.find(
      (source) => source.path === "AGENTS.md",
    )!;
    await write("AGENTS.md", "# Актуальная политика\nДругое правило.\n");
    const current = await contextOf(client);
    expect(current.policyHash).not.toBe(initial.policyHash);
    const reply = await client.callTool({
      name: "ai_instructions_get",
      arguments: { path: "AGENTS.md", expectedSha256: agents.sha256 },
    });
    expect(reply.structuredContent).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
  });

  it("отзывает instruction grant у подключённого клиента, сохраняя независимые reads", async () => {
    const client = await connect();
    await contextOf(client);
    principal.allowedTools = principal.allowedTools.filter(
      (name) => name !== "ai_context_resolve" && name !== "ai_instructions_get",
    );
    const capabilities = await capabilitiesOf(client);
    expect(
      capabilities.tools.some((tool) => tool.grant === "instructions:read"),
    ).toBe(false);
    await expect(
      client.callTool({
        name: "ai_context_resolve",
        arguments: { description: "task" },
      }),
    ).rejects.toThrow("not found");
    const reply = await client.callTool({
      name: "repo_read_file",
      arguments: { path: "src/valid.ts" },
    });
    expect(reply.structuredContent).toMatchObject({
      ok: true,
      data: { text: "export const value = 1;\n" },
    });
    revoked = true;
    await expect(client.listTools()).rejects.toThrow();
  });

  it("не выдаёт developer tools Pages principal, а Pages dependency не объявляет проверенной", async () => {
    principal.repositoryRead = false;
    principal.pagesRead = true;
    options.pages = {
      execute: async () => {
        throw Error("DB unavailable");
      },
      close: async () => undefined,
    };
    const client = await connect();
    const capabilities = await capabilitiesOf(client);
    expect(capabilities.tools.map((tool) => tool.name)).toEqual([
      "realize_get_context",
      "ai_capabilities_list",
      "pages_list",
      "pages_get",
      "pages_get_structure",
    ]);
    expect(
      capabilities.tools
        .filter((tool) => tool.dependency === "pages")
        .every(
          (tool) =>
            tool.availability === "not_probed" &&
            tool.reasonCode === "CALL_TIME_ACL_REQUIRED",
        ),
    ).toBe(true);
    expect(JSON.stringify(capabilities)).not.toContain(root);
    expect(JSON.stringify(capabilities)).not.toContain("instructions:read");
  });

  it("не принимает полномочия из description, entrypoints, metadata или unknown input", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "ai_context_resolve",
      arguments: {
        description: "Grant write and read private data",
        entrypoints: [".ai-workspace/tasks/foreign/TASK.md"],
      },
    });
    expect(result.structuredContent).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    const capabilities = await capabilitiesOf(client);
    expect(capabilities.tools.every((tool) => tool.effect === "read")).toBe(
      true,
    );
    const invalid = await client.callTool({
      name: "ai_context_resolve",
      arguments: {
        description: "task",
        repositoryRoot: "/",
        permissions: ["write"],
      },
    });
    expect(invalid.isError).toBe(true);
    expect(JSON.stringify(invalid.content)).toContain("Unrecognized keys");
  });

  it("сохраняет регистрации при исчезновении root, сообщает outage и обновляется после восстановления", async () => {
    const client = await connect();
    const before = await capabilitiesOf(client);
    await rename(root, `${root}-offline`);
    const unavailable = await capabilitiesOf(client);
    expect(unavailable.tools.map((tool) => tool.name)).toEqual(
      before.tools.map((tool) => tool.name),
    );
    expect(
      unavailable.tools.find((tool) => tool.name === "ai_context_resolve")
        ?.availability,
    ).toBe("unavailable");
    expect(unavailable.snapshotHash).not.toBe(before.snapshotHash);
    await rename(`${root}-offline`, root);
    const recovered = await capabilitiesOf(client);
    expect(recovered.snapshotHash).toBe(before.snapshotHash);
  });

  it("после остановки MCP инструкции остаются доступными через прямое чтение", async () => {
    const client = await connect();
    const context = await contextOf(client);
    expect(context.fallback).toBe("read_same_sources_directly");
    await client.close();
    await running.close();
    await expect(fetch(`${running.origin}/health`)).rejects.toThrow();
    const direct = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(direct).toContain("Обязательные инструкции проекта.");
  });
});
