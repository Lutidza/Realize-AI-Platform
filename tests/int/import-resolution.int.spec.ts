/**
 * @file tests/int/import-resolution.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Проверяет настоящий защищённый MCP resolver, snapshot/cursor, Unicode, бюджеты и HTTP telemetry.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, symlink, link } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHttpServer } from "../../services/internal-mcp/src/createMcpHttpServer.controller";
import { searchRepository } from "../../services/ai-control-plane/src/searchRepository.service";
import { createImportReadAdapter } from "../../services/ai-control-plane/src/createImportReadAdapter.adapter";
import { createRepositoryReadPolicy } from "../../services/ai-control-plane/src/repositoryReadPolicy.validator";
import { RepositoryCursorService } from "../../services/ai-control-plane/src/RepositoryCursor.service";
import type { RepositoryQueryContext } from "../../services/ai-control-plane/src/RepositoryQueries.types";
import { mcpToolInputs } from "../../packages/ai-contracts/src/mcpToolInputs.config";
import { mcpToolDataSchemas } from "../../packages/ai-contracts/src/mcpToolOutputs.config";
import { searchObservationSchema } from "../../packages/ai-contracts/src/searchObservation.schemas";

describe("MCP import resolution", () => {
  let root: string;
  let context: RepositoryQueryContext;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "realize-imports-"));
    await mkdir(join(root, "src"));
    context = {
      policy: await createRepositoryReadPolicy(root, true),
      principal: "imports-fixture",
      cursors: new RepositoryCursorService(),
      searchMetrics: {
        started: performance.now(),
        firstMatchMs: null,
        candidateFiles: null,
        filesRead: 0,
        bytesRead: 0,
        excludedFiles: 0,
      },
    };
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const write = async (path: string, text: string | Buffer) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  };
  const input = (extra: object = {}) =>
    mcpToolInputs.repo_search.parse({
      path: "src/main.ts",
      query: "Local",
      intent: "imports",
      resolveImports: true,
      ...extra,
    });
  const search = (extra: object = {}) =>
    searchRepository(context, input(extra));
  const two = async () => {
    await write(
      "src/main.ts",
      'import {Local as A} from "./a";\nimport {Local as B} from "./b";',
    );
    await write("src/a.ts", "export const Local = 1;");
    await write("src/b.ts", "export const Local = 2;");
  };

  it("opt-in строгий; обычный imports не получает поля resolution", async () => {
    await two();
    for (const extra of [
      { intent: "text" },
      { path: "" },
      { maxDepth: 13 },
      { maxDepth: 0 },
      { resolveImports: false, maxDepth: 2 },
    ])
      expect(() => input(extra)).toThrow();
    const normal = await search({ resolveImports: false });
    expect(normal).not.toHaveProperty("resolution");
    expect(normal.matches[0]).not.toHaveProperty("resolution");
    await expect(search({ path: "src" })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(search({ path: "src/missing.ts" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("paths и re-export раскрываются через strict reader и валидный DTO", async () => {
    await write(
      "tsconfig.json",
      '{"compilerOptions":{"paths":{"@/*":["src/*"]}}}',
    );
    await write("src/main.ts", 'import { Public as Local } from "@/barrel";');
    await write(
      "src/barrel/index.ts",
      'export { Original as Public } from "../actual.service";',
    );
    await write(
      "src/actual.service.ts",
      'export function Original() {}\nthrow new Error("must never execute");',
    );
    const result = await search();
    expect(mcpToolDataSchemas.repo_search.parse(result)).toEqual(result);
    expect(result.matches[0].resolution).toMatchObject({
      status: "resolved",
      reason: null,
      target: {
        path: "src/actual.service.ts",
        line: 1,
        column: 17,
        name: "Original",
        kind: "function",
      },
      chain: [{ path: "src/barrel/index.ts" }],
    });
    expect(context.searchMetrics?.filesRead).toBe(4);
  });

  it.each(["English", "Русский", "ქართული", "العربية", "漢字", "e\u0301"])(
    "координаты и path для %s с BOM/emoji/CRLF",
    async (name) => {
      const prefix = "\uFEFF/*👩🏽‍💻 e\u0301*/ export const ";
      await write(
        "src/main.ts",
        `import {${name} as Local} from './ქართული-${name}';`,
      );
      await write(`src/ქართული-${name}.ts`, `${prefix}${name} = 1;\r\n`);
      const result = await search();
      expect(result.matches[0].resolution?.target).toMatchObject({
        path: `src/ქართული-${name}.ts`,
        line: 1,
        column: [...prefix].length + 1,
        name,
      });
    },
  );

  it("cursor связывает дочерний source, maxDepth, configuration и отсутствующего кандидата", async () => {
    await two();
    const first = await search({ limit: 1 });
    expect(first.nextCursor).not.toBeNull();
    const next = await search({ limit: 1, cursor: first.nextCursor });
    expect(next.matches[0].resolution?.target?.path).toBe("src/b.ts");
    expect(next.nextCursor).toBeNull();
    await expect(
      search({ limit: 1, maxDepth: 2, cursor: first.nextCursor }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    await write("src/a.ts", "export const Local = 3;");
    await expect(
      search({ limit: 1, cursor: first.nextCursor }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const configPage = await search({ limit: 1 });
    await write("tsconfig.json", '{"compilerOptions":{"baseUrl":"."}}');
    await expect(
      search({ limit: 1, cursor: configPage.nextCursor }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await rm(join(root, "src/a.ts"));
    await write("src/a.js", "export const Local = 1;");
    const absent = await search({ limit: 1 });
    expect(absent.matches[0].resolution?.target?.path).toBe("src/a.js");
    await write("src/a.ts", "export const Local = 4;");
    await expect(
      search({ limit: 1, cursor: absent.nextCursor }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("workspace exports не раскрывают private subpath и invalid targets", async () => {
    await write("package.json", '{"workspaces":["packages/*"]}');
    await write("tsconfig.json", '{"compilerOptions":{"baseUrl":"."}}');
    await write("src/main.ts", 'import {Local} from "@fixture/lib/public";');
    await write(
      "packages/lib/package.json",
      '{"name":"@fixture/lib","exports":{"./public":"./source.ts","./private":null}}',
    );
    await write("packages/lib/source.ts", "export const Local = 1;");
    const resolved = mcpToolDataSchemas.repo_search.parse(await search());
    expect(resolved.matches[0].resolution?.target?.path).toBe(
      "packages/lib/source.ts",
    );
    expect(resolved.resolution?.blockedCandidates).toBeGreaterThan(0);
    expect(resolved.navigation?.skippedFiles).toBe(0);
    await write("src/main.ts", 'import {Local} from "@fixture/lib/private";');
    expect((await search()).matches[0].resolution?.reason).toBe("not_found");
    await write(
      "packages/lib/package.json",
      '{"name":"@fixture/lib","exports":{"./private":"../../src/escaped.ts"}}',
    );
    expect((await search()).matches[0].resolution?.reason).toBe(
      "unsupported_configuration",
    );
  });

  it("secret content, symlink, hardlink, исключённый target и traversal не раскрываются", async () => {
    await write("src/main.ts", 'import {Local} from "./target";');
    await write(
      "src/target.ts",
      `export const Local = "ghp_${"X".repeat(36)}";`,
    );
    const secret = await search();
    expect(secret.matches[0].resolution).toMatchObject({
      target: null,
      reason: "forbidden",
    });
    expect(JSON.stringify(secret)).not.toContain("ghp_");
    // Бюджет учитывает и bytes, прочитанные до отклонения secret detector.
    expect(context.searchMetrics?.filesRead).toBe(2);
    expect(context.searchMetrics?.bytesRead).toBeGreaterThan(70);
    await rm(join(root, "src/target.ts"));
    await symlink("/etc/passwd", join(root, "src/target.ts"));
    expect((await search()).matches[0].resolution?.reason).toBe("forbidden");
    await rm(join(root, "src/target.ts"));
    await write("src/original.ts", "export const Local = 1;");
    await link(join(root, "src/original.ts"), join(root, "src/target.ts"));
    expect((await search()).matches[0].resolution?.reason).toBe("forbidden");
    await write(
      "src/main.ts",
      'import {Local} from "../node_modules/private";',
    );
    expect((await search()).matches[0].resolution?.reason).toBe("forbidden");
    await write("src/main.ts", 'import {Local} from "../../outside";');
    expect((await search()).matches[0].resolution?.reason).toBe("forbidden");
  });

  it("match/read budgets дают неполный результат без cursor; отмена остаётся ошибкой", async () => {
    await write("src/main.ts", "import './a';\n".repeat(1001));
    await write("src/a.ts", "export const Local = 1;");
    const matches = await search({ query: "*", limit: 1 });
    expect(matches).toMatchObject({
      truncated: true,
      truncationReason: "scan_budget",
      nextCursor: null,
      snapshotHash: null,
    });
    await write(
      "src/main.ts",
      Array.from(
        { length: 12 },
        (_, n) => `import {Local as Local${n}} from './file${n}';`,
      ).join("\n"),
    );
    for (let n = 0; n < 12; n++)
      await write(
        `src/file${n}.ts`,
        `export const Local = 1;${" ".repeat(500000)}`,
      );
    const bytes = await search({ limit: 1 });
    expect(bytes).toMatchObject({
      truncated: true,
      truncationReason: "scan_budget",
      nextCursor: null,
    });
    expect(context.searchMetrics?.bytesRead).toBeLessThanOrEqual(4194304);
    context.signal = AbortSignal.abort();
    await expect(search()).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("отмена после первого chunk сохраняет фактические bytes в telemetry", async () => {
    await write("src/main.ts", " ".repeat(100000));
    const controller = new AbortController();
    context.signal = controller.signal;
    await expect(
      createImportReadAdapter(context).read("src/main.ts", {
        maximumBytes: 200000,
        onReadBytes: () => controller.abort(),
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(context.searchMetrics).toMatchObject({
      filesRead: 1,
      bytesRead: 65536,
    });
  });

  it("HTTP discovery/call/observer принимают opt-in без сохранения query/paths", async () => {
    await two();
    const events: unknown[] = [];
    const token = randomBytes(32).toString("base64url");
    const server = await createMcpHttpServer({
      port: 0,
      policy: context.policy,
      observeSearch: (event) => {
        events.push(event);
      },
      authorize: async (credential) => {
        if (credential !== token) throw new Error("fixture auth");
        return {
          principalID: "imports-http",
          installationID: "fixture",
          repositoryRead: true,
          pagesRead: false,
          allowedTools: ["repo_search"],
          limits: {
            callsPerMinute: 60,
            burst: 10,
            concurrentCalls: 1,
            responseBytes: 8192,
          },
        };
      },
    });
    const client = new Client({ name: "imports-fixture", version: "1.0.0" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${server.origin}/mcp`), {
          requestInit: { headers: { Authorization: `Bearer ${token}` } },
        }),
      );
      expect(
        JSON.stringify(
          (await client.listTools()).tools.find(
            (tool) => tool.name === "repo_search",
          )?.inputSchema,
        ),
      ).toContain("resolveImports");
      const result = await client.callTool({
        name: "repo_search",
        arguments: input(),
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        ok: true,
        data: {
          matches: [
            { resolution: { status: "resolved" } },
            { resolution: { status: "resolved" } },
          ],
        },
      });
      await expect.poll(() => events.length).toBe(1);
      const event = searchObservationSchema.parse(events[0]);
      expect(event).toMatchObject({
        operation: "imports",
        filesRead: 3,
        limits: { scanBytes: 4194304 },
        outcome: "complete",
      });
      expect(JSON.stringify(event)).not.toMatch(
        /Local|src\/a\.ts|resolveImports|Bearer/u,
      );
    } finally {
      await client.close();
      await server.close();
    }
  });
});
