/**
 * @file tests/int/search-observability.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-28
 * @description Проверяет privacy, потери очереди, реальные Unicode измерения и изоляцию отказов наблюдателя.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  searchObservationSchema,
  mcpToolInputs,
  MCP_DEFAULT_LIMITS,
} from "@realize/ai-contracts";
import { SearchObservationCollector } from "../../packages/payload-ai-plugin/src/search-observability/SearchObservationCollector.service";
import { createSearchObservationEndpoints } from "../../packages/payload-ai-plugin/src/search-observability/searchObservationEndpoints.controller";
import { sanitizeOptions } from "../../packages/payload-ai-plugin/src/options";
import { createRepositoryReadPolicy } from "../../services/ai-control-plane/src/repositoryReadPolicy.validator";
import { searchRepository } from "../../services/ai-control-plane/src/searchRepository.service";
import { RepositoryCursorService } from "../../services/ai-control-plane/src/RepositoryCursor.service";
import { createMcpHttpServer } from "../../services/internal-mcp/src/createMcpHttpServer.controller";
import type { RepositorySearchMetrics } from "../../services/ai-control-plane/src/RepositoryQueries.types";
import type { PayloadRequest } from "payload";
import { searchObservationFixture } from "./searchObservation.fixture";

describe("search diagnostics privacy and failure isolation", () => {
  it.each([
    { query: "private query" },
    { path: "/secret" },
    { cursor: "secret" },
    { modelTokens: 12 },
    { reason: "raw private error" },
  ])("rejects non-contract content %j", (extra) => {
    expect(
      searchObservationSchema.safeParse({
        ...searchObservationFixture(),
        ...extra,
      }).success,
    ).toBe(false);
  });
  it("bounds nested fields, rejects unknown limits, preserves unknown counters", () => {
    const event = searchObservationFixture();
    expect(searchObservationSchema.parse(event).bytesRead).toBeNull();
    expect(
      searchObservationSchema.safeParse({ ...event, durationMs: -1 }).success,
    ).toBe(false);
    expect(
      searchObservationSchema.safeParse({
        ...event,
        limits: { ...event.limits, query: "private" },
      }).success,
    ).toBe(false);
  });
  it("bounds queue during slow storage and reports dropped events without retrying search", async () => {
    let done!: () => void;
    const write = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            done = resolve;
          }),
      )
      .mockResolvedValue(0);
    const warn = vi.fn();
    const collector = new SearchObservationCollector(
      {
        append: write,
        control: {
          maintain: vi.fn().mockResolvedValue({ revision: 1, cleaned: false }),
        },
      },
      warn,
    );
    collector.record(searchObservationFixture());
    const pending = collector.flush();
    for (let i = 0; i < 150; i++) collector.record(searchObservationFixture());
    expect(write).toHaveBeenCalledTimes(1);
    done();
    await pending;
    await collector.close();
    expect(write.mock.calls[1][0]).toHaveLength(99);
    expect(warn).toHaveBeenCalledWith({
      code: "SEARCH_TELEMETRY_DROPPED",
      dropped: 51,
    });
  });
  it("absorbs failed persistence and logger errors", async () => {
    const collector = new SearchObservationCollector(
      {
        control: {
          maintain: vi.fn().mockResolvedValue({ revision: 1, cleaned: false }),
        },
        append: async () => {
          throw new Error("private DB detail");
        },
      },
      () => {
        throw new Error("logger failure");
      },
    );
    collector.record(searchObservationFixture());
    await expect(collector.close()).resolves.toBeUndefined();
  });
  it.each([null, { id: 1, roles: ["customer"] }])(
    "authorizes before touching body or database",
    async (user) => {
      const options = sanitizeOptions({
        access: {
          canManageAIConfiguration: () => false,
          canApproveRelease: () => false,
          canManageData: () => false,
          canManageIntegrations: () => false,
          canUseChat: () => false,
          canViewRuns: () => false,
        },
        runtime: {
          mode: "local-development",
          controlPlaneTokenEnv: "FIXTURE_CONTROL_TOKEN",
        },
      });
      for (const endpoint of createSearchObservationEndpoints(options)) {
        const req = {
          user,
          headers: new Headers(),
          payload: { logger: { error: vi.fn() } },
        } as unknown as PayloadRequest;
        const response = await endpoint.handler(req);
        expect(response.status).toBe(user ? 403 : 401);
      }
    },
  );
});

describe("search diagnostics measure actual multilingual work", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "realize-search-observation-"));
    await mkdir(join(root, "src"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const metrics = (): RepositorySearchMetrics => ({
    started: performance.now(),
    firstMatchMs: null,
    candidateFiles: null,
    filesRead: 0,
    bytesRead: 0,
    excludedFiles: 0,
  });

  it.each([
    "English",
    "Русский",
    "ქართული",
    "العربية",
    "漢字",
    "👩🏽‍💻",
    "e\u0301",
  ])("keeps text, Unicode columns and metrics for %s", async (term) => {
    const content = `\uFEFF${term}\r\n🙂x\u0301 ${term}\r\n`;
    await writeFile(join(root, "src/a.ts"), content);
    const measured = metrics();
    const context = {
      policy: await createRepositoryReadPolicy(root, true),
      principal: "test",
      cursors: new RepositoryCursorService(),
      searchMetrics: measured,
    };
    const input = mcpToolInputs.repo_search.parse({
      query: term,
      path: "src",
      limit: 1,
      caseSensitive: true,
    });
    const first = await searchRepository(context, input);
    expect(first.matches).toHaveLength(1);
    // MCP сохраняет начальный BOM как code point; CLI rg пропускает его.
    expect(first.matches[0]).toMatchObject({ line: 1, column: 2 });
    expect(measured.bytesRead).toBe(Buffer.byteLength(content));
    expect(measured).toMatchObject({
      candidateFiles: 1,
      filesRead: 1,
      excludedFiles: 0,
    });
    expect(measured.firstMatchMs).toBeGreaterThanOrEqual(0);
    const continued = metrics();
    const second = await searchRepository(
      { ...context, searchMetrics: continued },
      { ...input, cursor: first.nextCursor! },
    );
    expect(second.matches[0]).toMatchObject({ line: 2, column: 5 });
    expect(continued.bytesRead).toBe(Buffer.byteLength(content));
    expect(second.nextCursor).toBeNull();
  });
  it.each([
    ["ENGLISH", "english"],
    ["РУССКИЙ", "русский"],
  ])("case selection remains correct for %s", async (text, query) => {
    await writeFile(join(root, "src/a.ts"), text);
    const context = {
      policy: await createRepositoryReadPolicy(root, true),
      principal: "test",
      cursors: new RepositoryCursorService(),
    };
    expect(
      (
        await searchRepository(
          context,
          mcpToolInputs.repo_search.parse({ query, caseSensitive: false }),
        )
      ).matches,
    ).toHaveLength(1);
    expect(
      (
        await searchRepository(
          context,
          mcpToolInputs.repo_search.parse({ query, caseSensitive: true }),
        )
      ).matches,
    ).toHaveLength(0);
  });
  it("delivers real MCP response when observer throws, and records no query or snippets", async () => {
    await writeFile(join(root, "src/a.ts"), "private_search_phrase");
    const events: unknown[] = [];
    const running = await createMcpHttpServer({
      port: 0,
      policy: await createRepositoryReadPolicy(root, true),
      authorize: async () => ({
        principalID: "test",
        installationID: "fixture",
        repositoryRead: true,
        pagesRead: false,
        allowedTools: ["repo_search"],
        limits: MCP_DEFAULT_LIMITS,
      }),
      observeSearch: (event) => {
        events.push(event);
        throw new Error("collector failed");
      },
    });
    const client = new Client({ name: "diagnostics-test", version: "1.0.0" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${running.origin}/mcp`), {
          requestInit: {
            headers: { Authorization: `Bearer ${"a".repeat(43)}` },
          },
        }),
      );
      const result = await client.callTool({
        name: "repo_search",
        arguments: { query: "private_search_phrase", path: "src" },
      });
      expect(result.isError).not.toBe(true);
      expect(events).toHaveLength(1);
      expect(searchObservationSchema.parse(events[0])).toMatchObject({
        source: "mcp",
        returnedCount: 1,
        outcome: "complete",
        bytesRead: 21,
      });
      expect(JSON.stringify(events)).not.toMatch(
        /private_search_phrase|a\.ts|Bearer/,
      );
    } finally {
      await client.close();
      await running.close();
    }
  });
});
