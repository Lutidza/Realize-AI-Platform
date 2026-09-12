/**
 * @file tests/int/useWorkflowContinuation.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет отсутствие ложного повтора и согласование восстановления очереди без новой версии checkpoint.
 */

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunDTO } from "@realize/ai-contracts";
import { useWorkflowContinuation } from "../../packages/payload-ai-plugin/src/admin/chat/useWorkflowContinuation.hook";
import type { WorkflowContinuationOptions } from "../../packages/payload-ai-plugin/src/admin/chat/WorkflowContinuation.types";

const request = vi.hoisted(() => vi.fn());
vi.mock("../../packages/payload-ai-plugin/src/admin/realizeAIAPI", () => ({
  requestRealizeAI: request,
}));
const queued: RunDTO = {
  id: "root",
  conversationID: "chat",
  createdAt: "2026-09-11T10:00:00.000Z",
  updatedAt: "2026-09-11T10:00:00.000Z",
  provider: "openai-codex",
  sandboxProfile: "analysis-readonly",
  status: "queued",
  workflow: {
    key: "flow",
    title: "Процесс",
    revision: 1,
    stepKey: "agent",
    stepType: "agent_turn",
    version: 2,
    completedSteps: 0,
    phase: "running",
  },
};
const options = (run?: RunDTO): WorkflowContinuationOptions => ({
  run,
  conversationID: run?.conversationID,
  archived: false,
  enabled: true,
  ready: true,
  busy: false,
  draft: "",
  setDraft: vi.fn(),
  acceptResult: vi.fn(),
  refresh: vi.fn(async () => run),
});
beforeEach(() => request.mockReset());
afterEach(cleanup);

describe("shared workflow continuation reconciliation", () => {
  it("starts an empty chat without a retry or navigation lock", () => {
    const { result } = renderHook(() => useWorkflowContinuation(options()));
    expect(result.current.hasRetry).toBe(false);
    expect(result.current.isLocked).toBe(false);
    expect(result.current.pendingConversationID).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });

  it.each(["running", "cancelled", "failed", "completed"] as const)(
    "unlocks a recovered same-version run confirmed as %s",
    async (status) => {
      request.mockRejectedValueOnce(new TypeError("Ответ потерян"));
      const { result, rerender } = renderHook(
        ({ run }) => useWorkflowContinuation(options(run)),
        { initialProps: { run: queued } },
      );
      await act(async () => result.current.continue());
      expect(result.current.hasRetry).toBe(true);
      expect(result.current.isLocked).toBe(true);
      rerender({ run: { ...queued, status } });
      expect(result.current.hasRetry).toBe(false);
      expect(result.current.isLocked).toBe(false);
      expect(result.current.pendingConversationID).toBeUndefined();
      expect(result.current.error).toBeUndefined();
      expect(result.current.canContinue).toBe(false);
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it("retains the original body and key when a refresh still reports queued", async () => {
    request
      .mockRejectedValueOnce(new TypeError("Ответ потерян"))
      .mockResolvedValueOnce({ run: queued });
    const { result } = renderHook(() =>
      useWorkflowContinuation(options(queued)),
    );
    await act(async () => result.current.continue());
    await act(async () => result.current.refresh());
    expect(result.current.hasRetry).toBe(true);
    expect(result.current.isLocked).toBe(true);
    await act(async () => result.current.continue());
    expect(request.mock.calls[1][1].headers).toEqual(
      request.mock.calls[0][1].headers,
    );
    expect(request.mock.calls[1][1].body).toBe(request.mock.calls[0][1].body);
  });

  it("does not mistake another run at the same version for recovery confirmation", async () => {
    request.mockRejectedValueOnce(new TypeError("Ответ потерян"));
    const { result, rerender } = renderHook(
      ({ run }) => useWorkflowContinuation(options(run)),
      { initialProps: { run: queued } },
    );
    await act(async () => result.current.continue());
    rerender({
      run: {
        ...queued,
        id: "other",
        status: "running",
        workflow: { ...queued.workflow!, rootRunID: "root" },
      },
    });
    expect(result.current.hasRetry).toBe(true);
    expect(result.current.isLocked).toBe(true);
    expect(result.current.run?.id).toBe("root");
  });

  it("does not resurrect a confirmed frozen request from an older UI snapshot", async () => {
    request.mockRejectedValueOnce(new TypeError("Ответ потерян"));
    const { result, rerender } = renderHook(
      ({ run }) => useWorkflowContinuation(options(run)),
      { initialProps: { run: queued } },
    );
    await act(async () => result.current.continue());
    rerender({ run: { ...queued, status: "running" } });
    expect(result.current.isLocked).toBe(false);
    rerender({ run: queued });
    expect(result.current.hasRetry).toBe(false);
    expect(result.current.isLocked).toBe(false);
  });

  it("uses the same confirmation rule for an explicit detail refresh", async () => {
    request.mockRejectedValueOnce(new TypeError("Ответ потерян"));
    const state = options(queued);
    state.refresh = vi.fn(async (): Promise<RunDTO> => ({
      ...queued,
      status: "running",
    }));
    const { result } = renderHook(() => useWorkflowContinuation(state));
    await act(async () => result.current.continue());
    await act(async () => result.current.refresh());
    expect(result.current.hasRetry).toBe(false);
    expect(result.current.isLocked).toBe(false);
  });
});
