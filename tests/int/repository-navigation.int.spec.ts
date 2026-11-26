/**
 * @file tests/int/repository-navigation.int.spec.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Проверяет syntax MCP, защищённое чтение, DTO, cursor и настоящий HTTP вызов с telemetry.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, symlink, link } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHttpServer } from "../../services/internal-mcp/src/createMcpHttpServer.controller";
import { createRepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import { searchRepository } from "../../services/ai-control-plane/src/searchRepository.service";
import { RepositoryCursorService } from "../../services/ai-control-plane/src/RepositoryCursor.service";
import type { RepositoryQueryContext } from "../../services/ai-control-plane/src/RepositoryQueries.types";
import { mcpToolInputs } from "../../packages/ai-contracts/src/mcpToolInputs.config";
import { mcpToolDataSchemas } from "../../packages/ai-contracts/src/mcpToolOutputs.config";
import { searchObservationSchema } from "../../packages/ai-contracts/src/searchObservation.schemas";

describe("repository navigation: syntax и границы MCP", () => {
  let root: string;
  let context: RepositoryQueryContext;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "realize-navigation-"));
    await mkdir(join(root, "src"));
    context = {
      policy: await createRepositoryReadPolicy(root, true),
      principal: "navigation-test",
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
  const write = (path: string, text: string | Buffer) =>
    writeFile(join(root, path), text);
  const search = (extra: object = {}) =>
    searchRepository(
      context,
      mcpToolInputs.repo_search.parse({
        path: "src",
        query: "Needle",
        intent: "definitions",
        ...extra,
      }),
    );

  it("не меняет default literal контракт, intent строгий и output валидируется", async () => {
    await write(
      "src/a.ts",
      "// Needle\nexport function Needle() { return Needle(); }",
    );
    const literal = await search({ intent: "text" });
    expect(literal.matches).toHaveLength(3);
    expect(literal).not.toHaveProperty("navigation");
    expect(literal.matches[0]).not.toHaveProperty("syntax");
    const definition = await search();
    expect(definition.matches).toMatchObject([
      { line: 2, column: 17, syntax: { kind: "function", name: "Needle" } },
    ]);
    expect(definition.navigation).toMatchObject({
      precision: "syntax",
      parsedFiles: 1,
      syntaxErrorFiles: 0,
    });
    expect(mcpToolDataSchemas.repo_search.parse(definition)).toEqual(
      definition,
    );
    expect(mcpToolInputs.repo_search.parse({ query: "Needle" }).intent).toBe(
      "text",
    );
    for (const extra of [
      { intent: "semantic" },
      { intent: "definitions", regex: true },
    ])
      expect(
        mcpToolInputs.repo_search.safeParse({ query: "Needle", ...extra })
          .success,
      ).toBe(false);
  });

  it.each(["English", "Русский", "ქართული", "العربية", "漢字", "e\u0301"])(
    "сохраняет code point координаты %s с BOM/emoji/CRLF",
    async (name) => {
      const prefix = "\uFEFF/*👩🏽‍💻 e\u0301*/ export const ";
      await write("src/a.ts", `${prefix}${name} = 1;\r\n${name};\r\n`);
      const result = await search({ query: name });
      expect(result.matches).toMatchObject([
        { line: 1, column: [...prefix].length + 1, syntax: { name } },
      ]);
      expect(
        (await search({ query: name, intent: "references" })).matches,
      ).toMatchObject([{ line: 2, column: 1 }]);
    },
  );

  it("регистр и расширения .mts/.cjs: парсинг без Unicode normalization", async () => {
    await write(
      "src/a.mts",
      "export const РУССКИЙ = 1, ENGLISH = 2, e\u0301 = 3;",
    );
    await write("src/b.cjs", "const local = require('./module'); local();");
    expect(
      (await search({ query: "русский", caseSensitive: false })).matches,
    ).toHaveLength(1);
    expect(
      (await search({ query: "english", caseSensitive: true })).matches,
    ).toHaveLength(0);
    expect((await search({ query: "é" })).matches).toHaveLength(0);
    expect(
      (await search({ query: "module", intent: "imports" })).matches[0].syntax
        ?.kind,
    ).toBe("require");
  });

  it("caseless Unicode сохраняет matches и координаты при контекстном lowercasing", async () => {
    const prefix = "/*👩🏽‍💻*/ const model={";
    await write("src/a.ts", `${prefix}'ΟΣ':Foo};\r\nΟΣ.Foo;`);
    const result = await search({ query: "ος", caseSensitive: false });
    expect(result.matches).toMatchObject([
      {
        line: 1,
        column: [...prefix].length + 1,
        syntax: { kind: "property", name: "ΟΣ" },
      },
    ]);
    expect(
      (
        await search({
          query: "ος",
          caseSensitive: false,
          intent: "references",
        })
      ).matches,
    ).toMatchObject([{ line: 2, column: 1, syntax: { name: "ΟΣ" } }]);
  });

  it("не следует за import, symlink/hardlink и не раскрывает секреты/бинарные файлы", async () => {
    await write(
      "src/a.ts",
      'import { outside as Needle } from "../../private"; export const Safe = 1;',
    );
    await write("src/leak.ts", `const Needle = "ghp_${"X".repeat(36)}";`);
    await write("src/binary.ts", Buffer.from([0, 0xff]));
    await write("src/target.ts", "export const Needle = 1;");
    await link(join(root, "src/target.ts"), join(root, "src/hard.ts"));
    await symlink("/etc/passwd", join(root, "src/symlink.ts"));
    const result = await search();
    expect(result.matches).toEqual([]);
    expect(result.navigation?.skippedFiles).toBe(2);
    const imported = await search({ intent: "imports" });
    expect(imported.matches[0].syntax).toMatchObject({
      kind: "import",
      name: "Needle",
      importedName: "outside",
      moduleSpecifier: "../../private",
    });
    expect(context.searchMetrics?.filesRead).toBe(2);
    await expect(search({ path: ".ai-workspace" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("coverage явно отделяет ошибки syntax, unsupported и ограничение файла", async () => {
    await write("src/a.ts", "export const Needle = 1;");
    await write("src/b.ts", "function Needle( {");
    await write("src/c.css", "/* Needle */");
    await write("src/d.ts", " ".repeat(524289));
    const result = await search();
    expect(result.navigation).toEqual({
      precision: "syntax",
      languages: "typescript_javascript",
      parsedFiles: 1,
      prefilteredFiles: 0,
      unsupportedFiles: 1,
      skippedFiles: 1,
      syntaxErrorFiles: 1,
      maxFileBytes: 524288,
    });
    expect(result.matches).toHaveLength(1);
    expect(context.searchMetrics?.filesRead).toBe(2);
    expect(context.searchMetrics?.bytesRead).toBeLessThan(100);
  });

  it("cursor связывает intent, snapshot и principal; продолжение не теряет объявления", async () => {
    await write("src/a.ts", "export const Needle = 1;");
    await write("src/b.ts", "export const Needle = 2;");
    const first = await search({ limit: 1 });
    expect(first.truncationReason).toBe("page_limit");
    const second = await search({ limit: 1, cursor: first.nextCursor });
    expect(second.matches[0].path).not.toBe(first.matches[0].path);
    expect(second.nextCursor).toBeNull();
    await expect(
      search({ limit: 1, cursor: first.nextCursor, intent: "references" }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    await write("src/a.ts", "export const Needle = 1; // snapshot changed");
    await expect(
      search({ limit: 1, cursor: first.nextCursor }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("ограничивает ответ и match scan, выполняет отмену без выдачи успешного результата", async () => {
    await write("src/a.ts", "Needle;\n".repeat(10002));
    const bounded = await search({ intent: "references", limit: 1 });
    expect(bounded).toMatchObject({
      truncated: true,
      truncationReason: "scan_budget",
      snapshotHash: null,
      nextCursor: null,
    });
    context.responseBytes = 4100;
    await expect(search({ intent: "references" })).rejects.toMatchObject({
      code: "RESULT_LIMIT",
    });
    context.signal = AbortSignal.abort();
    await expect(search()).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("HTTP discovery/call принимает intent и автоматически выдаёт обезличенную operation", async () => {
    await write("src/a.ts", "export function Needle() {}\nNeedle();");
    const events: unknown[] = [];
    const token = randomBytes(32).toString("base64url");
    const server = await createMcpHttpServer({
      port: 0,
      policy: context.policy,
      observeSearch: (event) => {
        events.push(event);
      },
      authorize: async (credential) => {
        if (credential !== token) throw new Error("unauthorized fixture");
        return {
          principalID: "navigation-http",
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
    const client = new Client({ name: "navigation-fixture", version: "1.0.0" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${server.origin}/mcp`), {
          requestInit: { headers: { Authorization: `Bearer ${token}` } },
        }),
      );
      const catalog = await client.listTools();
      expect(
        JSON.stringify(
          catalog.tools.find((tool) => tool.name === "repo_search")
            ?.inputSchema,
        ),
      ).toContain("definitions");
      const result = await client.callTool({
        name: "repo_search",
        arguments: { path: "src", intent: "definitions", query: "Needle" },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        ok: true,
        data: {
          matches: [{ syntax: { kind: "function", name: "Needle" } }],
          navigation: { precision: "syntax" },
        },
      });
      await expect.poll(() => events.length).toBe(1);
      const event = searchObservationSchema.parse(events[0]);
      expect(event.operation).toBe("definitions");
      expect(event.bytesRead).toBeGreaterThan(0);
      expect(JSON.stringify(event)).not.toMatch(/Needle|src\/a\.ts/);
      await write("src/b.ts", "function Needle( {");
      await client.callTool({
        name: "repo_search",
        arguments: { path: "src", intent: "definitions", query: "Needle" },
      });
      await expect.poll(() => events.length).toBe(2);
      expect(searchObservationSchema.parse(events[1])).toMatchObject({
        outcome: "partial",
        reason: "analysis_coverage",
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
