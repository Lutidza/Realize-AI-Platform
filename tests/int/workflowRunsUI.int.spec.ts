/**
 * @file tests/int/workflowRunsUI.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет UTC-фильтры, URL-переходы и отмену устаревших страниц реестра.
 */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseWorkflowRunListQuery } from "@realize/ai-contracts";
import {
  buildWorkflowRunsURL,
  workflowRunsSearch,
} from "../../packages/payload-ai-plugin/src/admin/workflow-runs/buildWorkflowRunsURL.util";
import {
  workflowRunsFilterQuery,
  workflowRunsFilterValues,
} from "../../packages/payload-ai-plugin/src/admin/workflow-runs/workflowRunsFilters.util";
import { useWorkflowRuns } from "../../packages/payload-ai-plugin/src/admin/workflow-runs/useWorkflowRuns.hook";
import { useWorkflowRunOptions } from "../../packages/payload-ai-plugin/src/admin/workflow-runs/useWorkflowRunOptions.hook";
import { useWorkflowRunLeaveGuard } from "../../packages/payload-ai-plugin/src/admin/workflow-runs/useWorkflowRunLeaveGuard.hook";

const request = vi.hoisted(() => vi.fn());
vi.mock("../../packages/payload-ai-plugin/src/admin/realizeAIAPI", () => ({
  requestRealizeAI: request,
}));
beforeEach(() => request.mockReset());
afterEach(cleanup);

describe("workflow registry filters and navigation", () => {
  it("roundtrips an inclusive UTC date range across the year boundary", () => {
    const values = {
      query: "  Тест & поиск  ",
      workflowKey: "review",
      profileKey: "editor",
      status: "ready" as const,
      createdFrom: "2026-12-31",
      createdThrough: "2026-12-31",
    };
    const query = workflowRunsFilterQuery(values);
    expect(query.createdFrom).toBe("2026-12-31T00:00:00.000Z");
    expect(query.createdTo).toBe("2027-01-01T00:00:00.000Z");
    const url = buildWorkflowRunsURL(
      "/control/tools/ai/runs",
      { ...query, page: 4 },
      "root/one",
    );
    expect(url).toContain("/control/tools/ai/runs/root%2Fone?");
    const restored = parseWorkflowRunListQuery(
      new URLSearchParams(url.split("?")[1]),
    );
    expect(restored.page).toBe(4);
    expect(workflowRunsFilterValues(restored)).toEqual({
      ...values,
      query: "Тест & поиск",
    });
    expect(workflowRunsSearch(restored)).not.toContain("root");
  });

  it("rejects a reversed range before updating the URL", () => {
    expect(() =>
      workflowRunsFilterQuery({
        ...workflowRunsFilterValues({ page: 1, pageSize: 25 }),
        createdFrom: "2026-09-12",
        createdThrough: "2026-09-11",
      }),
    ).toThrow("не раньше");
  });

  it("does not fetch for an invalid or inactive query", () => {
    const { result } = renderHook(() => useWorkflowRuns(undefined));
    expect(result.current.loading).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps the latest server page when an old request resolves last", async () => {
    let first!: (value: unknown) => void;
    request
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            first = resolve;
          }),
      )
      .mockResolvedValueOnce({
        items: [],
        page: 2,
        pageSize: 25,
        totalItems: 26,
        totalPages: 2,
      });
    const { result, rerender } = renderHook(
      ({ search }) => useWorkflowRuns(search),
      { initialProps: { search: "page=1&pageSize=25" } },
    );
    rerender({ search: "page=2&pageSize=25" });
    await waitFor(() => expect(result.current.data?.page).toBe(2));
    await act(async () =>
      first({
        items: [],
        page: 1,
        pageSize: 25,
        totalItems: 26,
        totalPages: 2,
      }),
    );
    expect(result.current.data?.page).toBe(2);
    expect(request.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("loads historical choices lazily and passes search plus page to the server", async () => {
    request.mockResolvedValue({
      items: [{ key: "retired", title: "Старый процесс" }],
      page: 2,
      pageSize: 25,
      totalItems: 26,
      totalPages: 2,
    });
    const { result, rerender } = renderHook(
      ({ open }) => useWorkflowRunOptions("workflow", open, "Старый", 2),
      { initialProps: { open: false } },
    );
    expect(request).not.toHaveBeenCalled();
    rerender({ open: true });
    await waitFor(() =>
      expect(result.current.data?.items[0].key).toBe("retired"),
    );
    const params = new URLSearchParams(request.mock.calls[0][0].split("?")[1]);
    expect(Object.fromEntries(params)).toEqual({
      kind: "workflow",
      query: "Старый",
      page: "2",
      pageSize: "25",
    });
  });

  it("blocks same-tab navigation and warns on unload while retaining a request", () => {
    const { rerender } = renderHook(
      ({ locked }) => useWorkflowRunLeaveGuard(locked),
      { initialProps: { locked: true } },
    );
    const link = document.createElement("a");
    link.href = "/admin/ai";
    document.body.append(link);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    rerender({ locked: false });
    const next = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(next);
    expect(next.defaultPrevented).toBe(false);
    link.remove();
  });
});
