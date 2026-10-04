/**
 * @file tests/int/closeNativeSearchThreads.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Проверяет завершение native descendants только по реальным RPC metadata и bounded списку.
 */
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { JsonLineRPCClient } from "../../packages/codex-adapter/src/JsonLineRpcClient.adapter";
import { closeNativeSearchThreads } from "../../packages/codex-adapter/src/closeNativeSearchThreads.service";
const child = {
  id: "child-1",
  parentThreadId: "parent-1",
  status: { type: "idle" },
};
const client = (result: unknown) => {
  const request = vi.fn().mockResolvedValueOnce(result).mockResolvedValue({});
  return { request, rpc: { request } as unknown as JsonLineRPCClient };
};
describe("Native search descendant cleanup", () => {
  it("архивирует только завершённые descendants выбранного parent", async () => {
    const test = client({
      data: [child, { ...child, id: "child-2", status: { type: "notLoaded" } }],
      nextCursor: null,
    });
    expect(await closeNativeSearchThreads(test.rpc, "parent-1")).toBe(2);
    expect(test.request.mock.calls).toEqual([
      ["thread/list", { ancestorThreadId: "parent-1", limit: 5 }],
      ["thread/archive", { threadId: "child-1" }],
      ["thread/archive", { threadId: "child-2" }],
    ]);
  });
  it.each([
    { data: [{ ...child, parentThreadId: "foreign" }] },
    {
      data: [
        child,
        { ...child, id: "foreign-child", parentThreadId: "foreign" },
      ],
    },
    { data: [{ ...child, status: { type: "active" } }] },
    { data: [{ ...child, id: "parent-1" }] },
    { data: [child], nextCursor: "more" },
    { data: Array(5).fill(child) },
  ])(
    "отказывает при незавершённом, чужом или неполном наборе %j",
    async (result) => {
      const test = client(result);
      await expect(
        closeNativeSearchThreads(test.rpc, "parent-1"),
      ).rejects.toThrow(/^codex_search_child_/);
      expect(test.request).toHaveBeenCalledTimes(1);
    },
  );
});
