// @vitest-environment node
/**
 * @file tests/int/workflowRunRegistry.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Проверяет строгий query, auth read-only API и границы полной owned истории процессов.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseWorkflowRunListQuery,
  parseWorkflowRunOptionsQuery,
} from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../../packages/payload-ai-plugin/src/types";
import { WorkflowRunRegistryRepository } from "../../packages/payload-ai-plugin/src/endpoints/WorkflowRunRegistry.repository";
import { buildWorkflowRunListQuery } from "../../packages/payload-ai-plugin/src/endpoints/workflowRunRegistry.sql";
import { createWorkflowRunEndpoints } from "../../packages/payload-ai-plugin/src/endpoints/workflowRunEndpoints.controller";

const services = vi.hoisted(() => ({
  list: vi.fn(),
  options: vi.fn(),
  detail: vi.fn(),
}));
vi.mock(
  "../../packages/payload-ai-plugin/src/endpoints/listWorkflowRuns.service",
  () => ({
    listWorkflowRuns: services.list,
    listWorkflowRunOptions: services.options,
  }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/endpoints/getWorkflowRunDetail.service",
  () => ({ getWorkflowRunDetail: services.detail }),
);

describe("workflow registry query contract", () => {
  it("defaults to a bounded page and retains Unicode metadata search", () => {
    expect(
      parseWorkflowRunListQuery(new URLSearchParams("query=%20Каталог%20")),
    ).toEqual({ page: 1, pageSize: 25, query: "Каталог" });
  });

  it.each([
    "page=0",
    "page=-1",
    "page=1.5",
    "page=1000001",
    "pageSize=51",
    "pageSize=Infinity",
    "page=1&page=2",
    "unknown=x",
    "status=waiting",
    "workflowKey=bad%20key",
    "createdFrom=2026-02-30T00:00:00Z",
    "createdFrom=0000-01-01T00:00:00Z",
    "createdTo=0000-12-31T23:59:59.999Z",
    "createdTo=2026-09-11",
    "createdTo=2026-09-11T00:00:00%2B04:00",
    "createdFrom=2026-09-12T00:00:00Z&createdTo=2026-09-11T00:00:00Z",
    `query=${"a".repeat(201)}`,
  ])("rejects invalid query %s", (query) => {
    expect(() =>
      parseWorkflowRunListQuery(new URLSearchParams(query)),
    ).toThrow();
  });

  it("normalizes UTC dates and retains exact profile/process and leaf status", () => {
    expect(
      parseWorkflowRunListQuery(
        new URLSearchParams({
          page: "2",
          pageSize: "50",
          workflowKey: "catalog-edit",
          profileKey: "planner",
          status: "awaiting_input",
          createdFrom: "2026-09-01T00:00:00Z",
          createdTo: "2026-09-12T00:00:00.000Z",
        }),
      ),
    ).toEqual({
      page: 2,
      pageSize: 50,
      workflowKey: "catalog-edit",
      profileKey: "planner",
      status: "awaiting_input",
      createdFrom: "2026-09-01T00:00:00.000Z",
      createdTo: "2026-09-12T00:00:00.000Z",
    });
  });

  it.each(["0001-01-01T00:00:00.000Z", "9999-12-31T23:59:59.999Z"])(
    "accepts the PostgreSQL-compatible ISO boundary %s",
    (createdFrom) => {
      expect(
        parseWorkflowRunListQuery(new URLSearchParams({ createdFrom }))
          .createdFrom,
      ).toBe(createdFrom);
    },
  );

  it("requires a historical option kind and rejects list-only filter parameters", () => {
    expect(
      parseWorkflowRunOptionsQuery(
        new URLSearchParams("kind=profile&page=3&query=old"),
      ),
    ).toEqual({ kind: "profile", page: 3, pageSize: 25, query: "old" });
    for (const value of [
      "",
      "kind=other",
      "kind=workflow&status=ready",
      "kind=profile&kind=workflow",
    ])
      expect(() =>
        parseWorkflowRunOptionsQuery(new URLSearchParams(value)),
      ).toThrow();
  });

  it("passes search metacharacters as data without widening scope or wildcard matching", () => {
    const injection = "%' OR 1=1 --";
    const query = buildWorkflowRunListQuery(42, {
      page: 2,
      pageSize: 25,
      query: injection,
      status: "ready",
    });
    expect(query.text).not.toContain(injection);
    expect(query.values).toEqual([42, "ready", injection, 25, 25]);
    expect(query.text).toContain("strpos(lower(concat_ws");
  });
});

describe("owned workflow repository boundaries", () => {
  const database = { query: vi.fn() };
  const req = {
    payload: { db: { pool: database } },
  } as unknown as PayloadRequest;

  beforeEach(() => database.query.mockReset());

  it("does not turn an invalid serial identifier into a PostgreSQL cast failure", async () => {
    const repository = new WorkflowRunRegistryRepository(req);
    for (const id of ["abc", "0", "2147483648", "1 OR 1=1"])
      await expect(repository.getOwnedChain(id, 42)).rejects.toMatchObject({
        status: 404,
      });
    expect(database.query).not.toHaveBeenCalled();
  });

  it("returns the same not-found result for absent and unowned roots", async () => {
    database.query.mockResolvedValue({ rows: [] });
    await expect(
      new WorkflowRunRegistryRepository(req).getOwnedChain("12", 42),
    ).rejects.toMatchObject({ status: 404 });
    expect(database.query.mock.calls[0]?.[0].values).toEqual([42, 12]);
  });

  it("preserves all 64 segments instead of using truncated conversation history", async () => {
    const rows = Array.from({ length: 64 }, (_, index) => ({
      conversation: { id: 9, title: "Own" },
      run: { id: index + 1 },
      hasChild: index < 63,
    }));
    database.query.mockResolvedValue({ rows });
    const detail = await new WorkflowRunRegistryRepository(req).getOwnedChain(
      "1",
      42,
    );
    expect(detail.runs).toHaveLength(64);
    expect(detail.runs.at(-1)?.id).toBe(64);
  });

  it.each(["overflow", "broken-child"])(
    "rejects an incomplete chain: %s",
    async (kind) => {
      const length = kind === "overflow" ? 65 : 2;
      database.query.mockResolvedValue({
        rows: Array.from({ length }, (_, index) => ({
          conversation: { id: 9 },
          run: { id: index + 1 },
          hasChild: true,
        })),
      });
      await expect(
        new WorkflowRunRegistryRepository(req).getOwnedChain("1", 42),
      ).rejects.toMatchObject({ status: 409 });
    },
  );

  it("keeps the full total for a page beyond the end", async () => {
    database.query.mockResolvedValue({ rows: [{ total: 73, items: [] }] });
    const result = await new WorkflowRunRegistryRepository(req).options(42, {
      kind: "workflow",
      page: 9,
      pageSize: 25,
    });
    expect(result).toEqual({
      items: [],
      totalItems: 73,
      totalPages: 3,
      page: 9,
      pageSize: 25,
    });
  });

  it("rejects stored corruption before pagination and historical option projection", async () => {
    database.query.mockResolvedValue({
      rows: [{ items: [], total: 0, integrityError: true }],
    });
    const repository = new WorkflowRunRegistryRepository(req);
    await expect(
      repository.list(42, {
        page: 1_000_000,
        pageSize: 1,
        status: "completed",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      repository.options(42, {
        kind: "workflow",
        page: 1_000_000,
        pageSize: 1,
        query: "absent",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("workflow registry HTTP", () => {
  const options = {
    enabled: false,
    runtime: { mode: "local-development" },
    access: { canUseChat: vi.fn() },
  } as unknown as SanitizedRealizeAIPluginOptions;
  const request = (query = "", user: { id: number } | null = { id: 42 }) =>
    ({
      url: `http://localhost/api/realize-ai/workflow-runs${query}`,
      routeParams: { rootRunID: "12" },
      user,
      headers: new Headers(),
      payload: { logger: { error: vi.fn() } },
    }) as unknown as PayloadRequest;
  const handler = (index: number) =>
    createWorkflowRunEndpoints(options)[index]!.handler;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(options.access.canUseChat).mockResolvedValue(true);
    services.list.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      totalItems: 0,
      totalPages: 0,
    });
    services.options.mockResolvedValue({ items: [] });
    services.detail.mockResolvedValue({ item: { rootRunID: "12" } });
  });

  it("retains authenticated history reads while model execution is disabled", async () => {
    const response = await handler(0)(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(services.list).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
      42,
      {
        page: 1,
        pageSize: 25,
      },
    );
  });

  it("rejects unauthenticated and unauthorized callers before touching history", async () => {
    expect((await handler(0)(request("", null))).status).toBe(401);
    vi.mocked(options.access.canUseChat).mockResolvedValue(false);
    expect((await handler(0)(request())).status).toBe(403);
    expect(services.list).not.toHaveBeenCalled();
  });

  it("validates list/options before executing their services", async () => {
    expect((await handler(0)(request("?pageSize=500"))).status).toBe(400);
    expect((await handler(1)(request("?kind=all"))).status).toBe(400);
    expect(services.list).not.toHaveBeenCalled();
    expect(services.options).not.toHaveBeenCalled();
  });

  it("binds detail and historical options to the authenticated owner", async () => {
    expect(
      (await handler(1)(request("?kind=workflow&query=old&page=2"))).status,
    ).toBe(200);
    expect(services.options).toHaveBeenCalledWith(expect.anything(), 42, {
      kind: "workflow",
      query: "old",
      page: 2,
      pageSize: 25,
    });
    expect((await handler(2)(request())).status).toBe(200);
    expect(services.detail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
      42,
      "12",
    );
  });
});
