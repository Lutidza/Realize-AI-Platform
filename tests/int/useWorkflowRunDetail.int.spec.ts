/**
 * @file tests/int/useWorkflowRunDetail.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет действия карточки по серверным правам, полный DTO и подключение SSE к принятому сегменту.
 */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunDTO, WorkflowRunDetailDTO } from "@realize/ai-contracts";
import { useWorkflowRunDetail } from "../../packages/payload-ai-plugin/src/admin/workflow-runs/useWorkflowRunDetail.hook";
import { RealizeAIRequestError } from "../../packages/payload-ai-plugin/src/admin/RealizeAIRequest.error";

const { request, stream } = vi.hoisted(() => ({
  request: vi.fn(),
  stream: vi.fn(),
}));
vi.mock("../../packages/payload-ai-plugin/src/admin/realizeAIAPI", () => ({
  requestRealizeAI: request,
}));
vi.mock("../../packages/payload-ai-plugin/src/admin/useRunStream", () => ({
  useRunStream: stream,
}));
const createdAt = "2026-09-11T10:00:00.000Z";
const run = (overrides: Partial<RunDTO> = {}): RunDTO => ({
  id: "root",
  conversationID: "chat",
  createdAt,
  updatedAt: createdAt,
  provider: "openai-codex",
  sandboxProfile: "analysis-readonly",
  status: "completed",
  workflow: {
    key: "flow",
    title: "Проверка",
    revision: 1,
    stepKey: "answer",
    stepType: "request_input",
    version: 2,
    completedSteps: 1,
    phase: "awaiting_input",
  },
  ...overrides,
});
const detail = (latestRun = run()): WorkflowRunDetailDTO => ({
  item: {
    rootRunID: "root",
    latestRun,
    conversation: { id: "chat", title: "Диалог", status: "active" },
    status: "awaiting_input",
    createdAt,
    updatedAt: createdAt,
    segmentCount: 1,
    actions: { continue: false, reply: true, recover: false, cancel: false },
  },
  segments: [{ run: latestRun, completedStepKeys: [] }],
  steps: [],
  dataOperations: [],
  permissions: { canManageData: true, canManageConfiguration: true },
});
beforeEach(() => {
  request.mockReset();
  stream.mockReset();
  stream.mockReturnValue({
    elapsedSeconds: 0,
    phase: "idle",
    streamingMessage: "",
    retry: vi.fn(),
  });
});
afterEach(cleanup);

describe("workflow registry detail controller", () => {
  it("uses the full registry endpoint without a conversation-history request", async () => {
    const saved = detail();
    saved.segments = Array.from({ length: 40 }, (_, index) => ({
      run: run({ id: `segment-${index}` }),
      completedStepKeys: [],
    }));
    request.mockResolvedValue(saved);
    const { result } = renderHook(() => useWorkflowRunDetail("root"));
    await waitFor(() =>
      expect(result.current.detail?.segments).toHaveLength(40),
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe("/workflow-runs/root");
  });

  it("does not derive permission to continue from a ready checkpoint", async () => {
    const saved = detail();
    saved.item.actions.reply = false;
    saved.item.actions.reason = "Runtime отключён";
    request.mockResolvedValue(saved);
    const { result } = renderHook(() => useWorkflowRunDetail("root"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setDraft("Мой ответ"));
    expect(result.current.continuation.canContinue).toBe(false);
    await act(async () => result.current.continuation.continue());
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.current.navigationLocked).toBe(true);
  });

  it("attaches streaming to the accepted child before the detail refresh finishes", async () => {
    const child = run({
      id: "child",
      status: "queued",
      workflow: {
        ...run().workflow!,
        phase: "running",
        stepKey: "agent",
        stepType: "agent_turn",
        version: 3,
        rootRunID: "root",
        parentRunID: "root",
      },
    });
    let refresh!: (value: unknown) => void;
    request
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce({ run: child })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            refresh = resolve;
          }),
      );
    const { result } = renderHook(() => useWorkflowRunDetail("root"));
    await waitFor(() =>
      expect(result.current.continuation.canContinue).toBe(true),
    );
    act(() => result.current.setDraft("Мой ответ"));
    let submission!: Promise<void>;
    act(() => {
      submission = result.current.continuation.continue();
    });
    await waitFor(() =>
      expect(stream.mock.lastCall?.[0].run?.id).toBe("child"),
    );
    expect(result.current.draft).toBe("");
    expect(result.current.continuation.canContinue).toBe(false);
    const saved = detail(child);
    saved.item.actions.reply = false;
    saved.item.actions.cancel = true;
    saved.item.status = "queued";
    await act(async () => {
      refresh(saved);
      await submission;
    });
    expect(result.current.canCancel).toBe(true);
    expect(request.mock.calls[1][0]).toBe("/runs/root/workflow/continue");
  });

  it("preserves an answer after a stale checkpoint and enables only an explicit refresh", async () => {
    request
      .mockResolvedValueOnce(detail())
      .mockRejectedValueOnce(
        new RealizeAIRequestError("Шаг изменился", { status: 409 }),
      );
    const { result } = renderHook(() => useWorkflowRunDetail("root"));
    await waitFor(() =>
      expect(result.current.continuation.canContinue).toBe(true),
    );
    act(() => result.current.setDraft("Ответ, который нельзя потерять"));
    await act(async () => result.current.continuation.continue());
    expect(result.current.draft).toBe("Ответ, который нельзя потерять");
    expect(result.current.continuation.canContinue).toBe(false);
    expect(result.current.continuation.hasRetry).toBe(false);
    expect(result.current.navigationLocked).toBe(true);
  });

  it("refreshes server actions when SSE starts a queued segment", async () => {
    const queued = run({
      status: "queued",
      workflow: { ...run().workflow!, phase: "running" },
    });
    const saved = detail(queued);
    saved.item.status = "queued";
    saved.item.actions = {
      continue: false,
      reply: false,
      recover: true,
      cancel: true,
    };
    const running = detail({ ...queued, status: "running" });
    running.item.status = "running";
    running.item.actions = {
      continue: false,
      reply: false,
      recover: false,
      cancel: true,
    };
    request.mockResolvedValueOnce(saved).mockResolvedValueOnce(running);
    const { result } = renderHook(() => useWorkflowRunDetail("root"));
    await waitFor(() =>
      expect(result.current.latestRun?.status).toBe("queued"),
    );
    act(() => stream.mock.lastCall?.[0].onRunUpdate(running.item.latestRun));
    await waitFor(() =>
      expect(result.current.detail?.item.status).toBe("running"),
    );
    expect(result.current.canCancel).toBe(true);
    expect(result.current.continuation.canContinue).toBe(false);
  });

  it("keeps the exact cancellation key after an unknown POST and unlocks on terminal refresh", async () => {
    const active = run({
      status: "running",
      workflow: { ...run().workflow!, phase: "running" },
    });
    const saved = detail(active);
    saved.item.actions = {
      continue: false,
      reply: false,
      recover: false,
      cancel: true,
    };
    saved.item.status = "running";
    request
      .mockResolvedValueOnce(saved)
      .mockRejectedValueOnce(new TypeError("Связь прервана"));
    const { result } = renderHook(() => useWorkflowRunDetail("root"));
    await waitFor(() => expect(result.current.canCancel).toBe(true));
    await act(async () => result.current.cancel());
    expect(result.current.cancelRetry).toBe(true);
    expect(result.current.navigationLocked).toBe(true);
    const terminal = detail(run({ status: "cancelled" }));
    terminal.item.status = "cancelled";
    terminal.item.actions = {
      continue: false,
      reply: false,
      recover: false,
      cancel: false,
    };
    request.mockResolvedValueOnce({}).mockResolvedValueOnce(terminal);
    await act(async () => result.current.cancel());
    expect(request.mock.calls[2][1].headers).toEqual(
      request.mock.calls[1][1].headers,
    );
    expect(result.current.navigationLocked).toBe(false);
  });
});
