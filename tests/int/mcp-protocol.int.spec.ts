/**
 * @file tests/int/mcp-protocol.int.spec.ts
 * @version 1.1.1
 * @date 2026-09-24
 * @description Проверяет обе protocol eras настоящими SDK clients и Git на одноразовом checkout.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  chmod,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { request } from "node:http";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { Git } from "../../.ai/tools/git-delivery/src/Git.adapter";
import { readGitDiff } from "../../.ai/tools/git-delivery/src/read/readGitDiff.service";
import { readGitStatus } from "../../.ai/tools/git-delivery/src/read/readGitStatus.service";
import { createMcpHttpServer } from "../../services/internal-mcp/src/createMcpHttpServer.controller";
import { McpError } from "../../services/internal-mcp/src/Mcp.error";
import { createRepositoryReadPolicy } from "../../services/ai-control-plane/src/repositoryReadPolicy.validator";
import { RepositoryCursorService } from "../../services/ai-control-plane/src/RepositoryCursor.service";
import { MCP_REALIZE_TOOLS } from "../../packages/ai-contracts/src/mcpServer.config";
import type { McpRuntimeOptions } from "../../services/internal-mcp/src/McpRuntime.types";

describe("MCP: loopback HTTP и read-only Git", () => {
  let root: string;
  let git: Git;
  let options: McpRuntimeOptions;
  let running: Awaited<ReturnType<typeof createMcpHttpServer>>;
  let revoked: boolean;
  let token: string;
  const clients: Client[] = [];
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "realize-mcp-protocol-"));
    await mkdir(join(root, "src"));
    git = new Git(root);
    await git.run(["init", "--initial-branch=main"]);
    await writeFile(join(root, "src/a.ts"), "first\nsecond\nthird\n");
    await git.run(["add", "--", "src/a.ts"]);
    await git.run(
      [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-m",
        "fixture",
      ],
      {
        env: {
          GIT_AUTHOR_NAME: "Fixture",
          GIT_AUTHOR_EMAIL: "fixture@example.invalid",
          GIT_COMMITTER_NAME: "Fixture",
          GIT_COMMITTER_EMAIL: "fixture@example.invalid",
        },
      },
    );
    revoked = false;
    token = randomBytes(32).toString("base64url");
    options = {
      port: 0,
      policy: await createRepositoryReadPolicy(root, true),
      authorize: async (credential) => {
        if (credential !== token || revoked)
          throw new McpError("FORBIDDEN", "Недействительный ключ.", 401);
        return {
          principalID: "protocol-fixture",
          installationID: "fixture",
          repositoryRead: true,
          pagesRead: false,
          allowedTools: [...MCP_REALIZE_TOOLS],
          limits: {
            callsPerMinute: 60,
            burst: 10,
            concurrentCalls: 4,
            responseBytes: 131072,
          },
        };
      },
    };
    running = await createMcpHttpServer(options);
  });
  afterEach(async () => {
    await Promise.allSettled(clients.splice(0).map((client) => client.close()));
    await running?.close();
    await rm(root, { recursive: true, force: true });
  });
  const connect = async (era: "modern" | "legacy") => {
    const client = new Client(
      { name: "realize-fixture", version: "1.0.0" },
      {
        versionNegotiation: {
          mode: era === "modern" ? { pin: "2026-07-28" } : "legacy",
        },
        supportedProtocolVersions:
          era === "legacy" ? ["2025-11-25"] : ["2026-07-28", "2025-11-25"],
      },
    );
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${running.origin}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    return client;
  };
  it("probes Git metadata without reading every working file", async () => {
    await writeFile(
      join(root, "src/oversized.ts"),
      Buffer.alloc(2 * 1024 * 1024 + 1, 97),
    );
    const client = await connect("modern");
    const result = await client.callTool({
      name: "ai_capabilities_list",
      arguments: {},
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: true,
      data: {
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: "repo_git_status",
            availability: "available",
          }),
          expect.objectContaining({
            name: "repo_read_file",
            availability: "available",
          }),
        ]),
      },
    });
    const file = await client.callTool({
      name: "repo_read_file",
      arguments: { path: "src/oversized.ts" },
    });
    expect(file.isError).toBe(true);
  });

  it.each(["modern", "legacy"] as const)(
    "обслуживает %s discovery/list/call через один registry",
    async (era) => {
      const client = await connect(era);
      expect(client.getProtocolEra()).toBe(era);
      expect(client.getNegotiatedProtocolVersion()).toBe(
        era === "modern" ? "2026-07-28" : "2025-11-25",
      );
      const catalog = await client.listTools();
      expect(catalog.tools.map((tool) => tool.name)).toEqual(
        MCP_REALIZE_TOOLS.filter((name) => !name.startsWith("pages_")),
      );
      expect(
        catalog.tools.every((tool) => tool.annotations?.readOnlyHint === true),
      ).toBe(true);
      const result = await client.callTool({
        name: "repo_read_file",
        arguments: { path: "src/a.ts", startLine: 2, lineCount: 1 },
      });
      expect(result.structuredContent).toMatchObject({
        ok: true,
        schemaVersion: "1.0",
        data: { text: "second\n", startLine: 2, endLine: 2 },
      });
      const context = await client.callTool({
        name: "realize_get_context",
        arguments: {},
      });
      expect(context.structuredContent).toMatchObject({
        ok: true,
        data: { repository: { branch: "main", dirty: false } },
      });
      for (const [name, arguments_] of [
        ["repo_list_files", { path: "src" }],
        ["repo_search", { query: "second" }],
        ["repo_git_status", {}],
        ["repo_git_diff", { scope: "working_tree", paths: ["src/a.ts"] }],
      ] as const) {
        const read = await client.callTool({ name, arguments: arguments_ });
        expect(read.isError, JSON.stringify(read.structuredContent)).not.toBe(
          true,
        );
        expect(read.structuredContent).toMatchObject({
          ok: true,
          schemaVersion: "1.0",
        });
      }
    },
  );
  it("проверяет auth, Host, Origin и лимит body до SDK", async () => {
    expect(
      (await fetch(`${running.origin}/mcp`, { method: "POST", body: "{}" }))
        .status,
    ).toBe(401);
    expect(
      (
        await fetch(`${running.origin}/mcp`, {
          headers: {
            authorization: `Bearer ${token}`,
            origin: "https://untrusted.invalid",
          },
        })
      ).status,
    ).toBe(403);
    const badHost = await new Promise<number>((resolve, reject) => {
      const req = request(
        `${running.origin}/mcp`,
        { headers: { authorization: `Bearer ${token}`, host: "evil.invalid" } },
        (res) => {
          res.resume();
          resolve(res.statusCode!);
        },
      );
      req.on("error", reject);
      req.end();
    });
    expect(badHost).toBe(403);
    expect(
      (
        await fetch(`${running.origin}/mcp`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body: "x".repeat(65537),
        })
      ).status,
    ).toBe(413);
    expect(await (await fetch(`${running.origin}/health`)).json()).toEqual({
      status: "ok",
      version: "1.1.0",
    });
  });
  it("отзыв ключа закрывает следующий вызов после discovery", async () => {
    const client = await connect("modern");
    await client.listTools();
    revoked = true;
    await expect(
      client.callTool({
        name: "repo_read_file",
        arguments: { path: "src/a.ts" },
      }),
    ).rejects.toThrow();
  });
  it("ошибочные tools и неизвестные поля не завершают listener", async () => {
    const client = await connect("legacy");
    const invalid = await client.callTool({
      name: "repo_read_file",
      arguments: { path: "src/a.ts", actor: "admin" },
    });
    expect(invalid.isError).toBe(true);
    const forbidden = await client.callTool({
      name: "repo_read_file",
      arguments: { path: ".env" },
    });
    expect(forbidden).toMatchObject({
      isError: true,
      structuredContent: { ok: false, error: { code: "FORBIDDEN" } },
    });
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(
      MCP_REALIZE_TOOLS.filter((name) => !name.startsWith("pages_")),
    );
    for (const method of ["GET", "DELETE"]) {
      const response = await fetch(`${running.origin}/mcp`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          "mcp-protocol-version": "2025-11-25",
        },
      });
      expect(response.status).toBe(405);
    }
  });
  it("ограничивает незавершённые HTTP calls и освобождает slots после результата", async () => {
    const authorize = options.authorize;
    options.authorize = async (credential) => ({
      ...(await authorize(credential)),
      pagesRead: true,
      payloadUserID: "fixture",
    });
    let entered = 0;
    const gate = Promise.withResolvers<void>();
    options.pages = {
      execute: async () => {
        entered++;
        await gate.promise;
        return { pages: [], page: 1, totalPages: 1, totalDocs: 0 };
      },
      close: async () => undefined,
    };
    const client = await connect("modern");
    const pending = Array.from({ length: 4 }, () =>
      client.callTool({ name: "pages_list", arguments: {} }),
    );
    try {
      await expect.poll(() => entered).toBe(4);
      const overflow = await client.callTool({
        name: "pages_list",
        arguments: {},
      });
      expect(overflow.structuredContent).toMatchObject({
        ok: false,
        error: { code: "RATE_LIMITED" },
      });
    } finally {
      gate.resolve();
      const completed = await Promise.all(pending);
      expect(completed.every((result) => result.isError !== true)).toBe(true);
    }
    expect(
      (
        await client.callTool({
          name: "repo_read_file",
          arguments: { path: "src/a.ts" },
        })
      ).isError,
    ).not.toBe(true);
  });
  it("отклоняет неизвестный protocol, malformed JSON и неверные media headers", async () => {
    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
    };
    const malformed = await fetch(`${running.origin}/mcp`, {
      method: "POST",
      headers,
      body: "{",
    });
    expect(malformed.status).toBe(400);
    const unsupported = await fetch(`${running.origin}/mcp`, {
      method: "POST",
      headers: { ...headers, "mcp-protocol-version": "1900-01-01" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(unsupported.status).toBe(400);
    const media = await fetch(`${running.origin}/mcp`, {
      method: "POST",
      headers: { ...headers, "content-type": "text/plain" },
      body: "{}",
    });
    expect(media.status).toBe(415);
    const client = await connect("legacy");
    await expect(
      client.callTool({
        name: "not_a_real_tool",
        arguments: {},
      }),
    ).rejects.toThrow("not found");
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(
      MCP_REALIZE_TOOLS.filter((name) => !name.startsWith("pages_")),
    );
  });
  it("различает index/working_tree, не меняет индекс и не выполняет внешние фильтры", async () => {
    await writeFile(join(root, "src/a.ts"), "staged\nsecond\nthird\n");
    await git.run(["add", "--", "src/a.ts"]);
    await writeFile(join(root, "src/a.ts"), "working\nsecond\nthird\n");
    await writeFile(join(root, ".env"), "private fixture");
    await writeFile(join(root, "src/new.ts"), "new");
    await git.run(["config", "diff.external", "touch forbidden-executed"]);
    await git.run(["config", "core.fsmonitor", "touch forbidden-executed"]);
    const indexBefore = await readFile(join(root, ".git/index"));
    const context = {
      policy: options.policy!,
      principal: "fixture",
      cursors: new RepositoryCursorService(),
    };
    const status = await readGitStatus(context, { limit: 100 });
    expect(status.entries).toEqual([
      {
        path: "src/a.ts",
        indexStatus: "M",
        worktreeStatus: "M",
        conflicted: false,
      },
      {
        path: "src/new.ts",
        indexStatus: "?",
        worktreeStatus: "?",
        conflicted: false,
      },
    ]);
    for (const scope of ["index", "working_tree"] as const) {
      const diff = await readGitDiff(context, {
        scope,
        paths: ["src/a.ts"],
        contextLines: 3,
        limitBytes: 32768,
      });
      expect(diff.files[0].patch).toContain(
        scope === "index" ? "+staged" : "+working",
      );
      expect(diff.files[0].before.source).toBe(
        scope === "index" ? "head" : "index",
      );
      expect(diff.files[0].after.source).toBe(
        scope === "index" ? "index" : "working_tree",
      );
    }
    expect(await readFile(join(root, ".git/index"))).toEqual(indexBefore);
    await expect(readFile(join(root, "forbidden-executed"))).rejects.toThrow();
    await expect(
      readGitDiff(context, {
        scope: "index",
        paths: [".env"],
        contextLines: 3,
        limitBytes: 32768,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("освобождает порт и запрещает одновременный bind", async () => {
    const port = Number(new URL(running.origin).port);
    await expect(
      createMcpHttpServer({ ...options, port }),
    ).rejects.toMatchObject({ code: "EADDRINUSE" });
    await running.close();
    running = await createMcpHttpServer({ ...options, port });
    expect((await fetch(`${running.origin}/health`)).status).toBe(200);
  });

  it("показывает binary omission, untracked и изменение режима без выдачи bytes", async () => {
    const context = {
      policy: options.policy!,
      principal: "fixture",
      cursors: new RepositoryCursorService(),
    };
    await writeFile(join(root, "src/binary.ts"), Buffer.from([1, 0, 2, 3]));
    await git.run(["add", "--", "src/binary.ts"]);
    const binary = await readGitDiff(context, {
      scope: "index",
      paths: ["src/binary.ts"],
      contextLines: 0,
      limitBytes: 32768,
    });
    expect(binary.files[0]).toMatchObject({
      status: "binary",
      patch: "",
      omittedReason: "binary",
    });
    await writeFile(join(root, "src/new.ts"), "new\n");
    expect(
      (
        await readGitDiff(context, {
          scope: "working_tree",
          paths: ["src/new.ts"],
          contextLines: 0,
          limitBytes: 32768,
        })
      ).files[0].omittedReason,
    ).toBe("untracked");
    await chmod(join(root, "src/a.ts"), 0o755);
    const mode = await readGitDiff(context, {
      scope: "working_tree",
      paths: ["src/a.ts"],
      contextLines: 0,
      limitBytes: 32768,
    });
    expect(mode.files[0].patch).toContain("new mode 100755");
  });

  it("собирает все полные hunks из порций и отвергает изменившийся cursor", async () => {
    const context = {
      policy: options.policy!,
      principal: "fixture",
      cursors: new RepositoryCursorService(),
      responseBytes: 8192,
    };
    const source = Array.from(
      { length: 300 },
      (_, index) => `line ${index} ${"a".repeat(65)}`,
    );
    await writeFile(join(root, "src/paged.ts"), source.join("\n") + "\n");
    await git.run(["add", "--", "src/paged.ts"]);
    const changed = source.map((line, index) =>
      index % 8 ? line : line + " changed",
    );
    await writeFile(join(root, "src/paged.ts"), changed.join("\n") + "\n");
    const input = {
      scope: "working_tree" as const,
      paths: ["src/paged.ts"],
      contextLines: 0,
      limitBytes: 2048,
    };
    const patches: string[] = [];
    let cursor: string | undefined;
    const first = await readGitDiff(context, input);
    expect(first.truncated).toBe(true);
    do {
      const portion = await readGitDiff(context, {
        ...input,
        ...(cursor ? { cursor } : {}),
      });
      patches.push(...portion.files.map((file) => file.patch));
      cursor = portion.nextCursor ?? undefined;
    } while (cursor);
    expect(patches).toHaveLength(38);
    expect(new Set(patches).size).toBe(38);
    expect(
      patches.every(
        (patch) => patch.includes("@@") && patch.includes(" changed"),
      ),
    ).toBe(true);
    await writeFile(join(root, "src/paged.ts"), "replacement\n");
    await expect(
      readGitDiff(context, { ...input, cursor: first.nextCursor! }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("проверяет исторический текст на секреты даже после удаления из working tree", async () => {
    const secret = "ghp_" + "x".repeat(36);
    await writeFile(join(root, "src/unsafe.ts"), secret);
    await git.run(["add", "--", "src/unsafe.ts"]);
    await rm(join(root, "src/unsafe.ts"));
    await expect(
      readGitDiff(
        {
          policy: options.policy!,
          principal: "fixture",
          cursors: new RepositoryCursorService(),
        },
        {
          scope: "working_tree",
          paths: ["src/unsafe.ts"],
          contextLines: 0,
          limitBytes: 32768,
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("отмечает detached и unborn без неявного изменения refs", async () => {
    const context = {
      policy: options.policy!,
      principal: "fixture",
      cursors: new RepositoryCursorService(),
    };
    await git.run(["checkout", "--detach", "HEAD"]);
    expect(await readGitStatus(context, { limit: 100 })).toMatchObject({
      branch: null,
      detached: true,
      unborn: false,
    });
    const empty = await mkdtemp(join(tmpdir(), "realize-mcp-unborn-"));
    try {
      await new Git(empty).run(["init", "--initial-branch=empty"]);
      expect(
        await readGitStatus(
          { ...context, policy: await createRepositoryReadPolicy(empty, true) },
          { limit: 100 },
        ),
      ).toMatchObject({
        branch: "empty",
        head: null,
        unborn: true,
        entries: [],
      });
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it("запускает CLI bootstrap без БД и освобождает процесс и port по SIGTERM", async () => {
    const port = Number(new URL(running.origin).port);
    await running.close();
    const child = spawn(
      process.execPath,
      ["--import=tsx/esm", "services/internal-mcp/src/runMcp.controller.ts"],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          REALIZE_MCP_CONFIGURATION_MODE: "bootstrap",
          REALIZE_MCP_REPOSITORY_READ_ENABLED: "true",
          REALIZE_MCP_REPOSITORY_ROOT: root,
          REALIZE_MCP_TOKEN: token,
          REALIZE_MCP_PRINCIPAL_ID: "cli-fixture",
          REALIZE_MCP_PORT: String(port),
          DATABASE_URI: "postgresql://127.0.0.1:1/unavailable",
          PAYLOAD_SECRET: "",
          __NEXT_PROCESSED_ENV: "true",
        },
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const finished = new Promise<number | null>((resolve) =>
      child.once("close", resolve),
    );
    try {
      await expect
        .poll(
          async () => {
            try {
              return (await fetch(`http://127.0.0.1:${port}/health`)).status;
            } catch {
              return 0;
            }
          },
          { timeout: 12000 },
        )
        .toBe(200);
      const client = await connect("modern");
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(
        MCP_REALIZE_TOOLS.filter((name) => !name.startsWith("pages_")),
      );
      await client.close();
      child.kill("SIGTERM");
      expect(await finished).toBe(0);
      expect(output).not.toContain(token);
      running = await createMcpHttpServer({ ...options, port });
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await finished;
      }
    }
  }, 20000);
});
