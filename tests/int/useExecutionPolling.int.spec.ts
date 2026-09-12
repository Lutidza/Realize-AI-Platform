/**
 * @file tests/int/useExecutionPolling.int.spec.ts
 * @version 1.0.1
 * @date 2026-09-11
 * @description Проверяет отмену polling диалога и защиту новых событий от поздних ответов.
 */

import { act, cleanup, renderHook } from "@testing-library/react";
import type {
  ConversationDetailDTO,
  ExecutionJobDTO,
} from "@realize/ai-contracts";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExecutionPolling } from "../../packages/payload-ai-plugin/src/admin/useExecutionPolling";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../packages/payload-ai-plugin/src/admin/realizeAIAPI", () => ({
  requestRealizeAI: mocks.request,
}));

const time = "2026-09-11T12:00:00Z";
const conversation = (
  status: ExecutionJobDTO["status"] = "queued",
): ConversationDetailDTO => ({
  conversation: {
    id: "chat-1",
    title: "Диалог",
    status: "active",
    createdAt: time,
    updatedAt: time,
    lastMessageAt: time,
  },
  messages: [],
  runs: [],
  dataOperations: [],
  changeRequests: [
    {
      id: "change-1",
      conversationID: "chat-1",
      sourceMessageID: "message-1",
      title: "Страница",
      type: "CODE_CHANGE",
      riskLevel: "R3",
      state: "execution_queued",
      version: 1,
      affectedPaths: [],
      checks: [],
      normalizedIntent: "Страница",
      originalRequest: "Страница",
      plan: "План",
      planHash: "plan",
      scopeHash: "scope",
      createdAt: time,
      updatedAt: time,
      expiresAt: time,
      execution: {
        enabled: true,
        job: {
          id: "job-1",
          status,
          stage: "queued",
          allowedPaths: [],
          artifactsExpireAt: time,
          baseCommit: "abc",
          branch: "ai/change",
          changedPaths: [],
          checks: [],
          createdAt: time,
          updatedAt: time,
          diffStat: [],
          diffTruncated: false,
        },
      },
      preview: { enabled: false },
      release: { enabled: false },
      sourcePromotion: { enabled: false },
    },
  ],
});

const setup = (initial = conversation()) => {
  const detailRef = { current: initial as ConversationDetailDTO | undefined };
  const setError = vi.fn();
  const hook = renderHook(
    () => {
      const [detail, setDetail] = useState(detailRef.current);
      useExecutionPolling({ detail, detailRef, setDetail, setError });
      return { detail, setDetail };
    },
    { wrapper: StrictMode },
  );
  return { ...hook, detailRef, setError };
};

beforeEach(() => {
  vi.useFakeTimers();
  mocks.request.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Обновление состояния выполнения", () => {
  it("применяет свежий снимок и прекращает polling после завершения задания", async () => {
    mocks.request.mockResolvedValue(conversation("completed"));
    const { result, detailRef } = setup();
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    expect(result.current.detail?.changeRequests[0].execution.job?.status).toBe(
      "completed",
    );
    expect(detailRef.current).toBe(result.current.detail);
    await act(() => vi.advanceTimersByTimeAsync(6_000));
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("не перезаписывает новое событие SSE поздним ответом polling", async () => {
    let complete!: (value: ConversationDetailDTO) => void;
    mocks.request.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const { result, detailRef } = setup();
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    const newer = conversation();
    newer.messages.push({
      id: "message-new",
      content: "Новое событие",
      conversationID: "chat-1",
      createdAt: time,
      dataOperationIntentAvailable: false,
      changePlan: { status: "needs_clarification", reason: "too_short" },
      kind: "assistant_message",
      role: "assistant",
      sequence: 2,
    });
    act(() => {
      detailRef.current = newer;
      result.current.setDetail(newer);
    });
    await act(async () => complete(conversation("running")));
    expect(result.current.detail).toBe(newer);
    expect(detailRef.current?.messages[0].content).toBe("Новое событие");
  });

  it("не пересекает запросы и отменяет чтение при закрытии диалога", async () => {
    let complete!: (value: ConversationDetailDTO) => void;
    mocks.request.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const { unmount, detailRef, setError } = setup();
    const original = detailRef.current;
    await act(() => vi.advanceTimersByTimeAsync(6_000));
    expect(mocks.request).toHaveBeenCalledTimes(1);
    const signal = mocks.request.mock.calls[0][1].signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => complete(conversation("completed")));
    expect(detailRef.current).toBe(original);
    expect(setError).not.toHaveBeenCalled();
  });

  it("прерывает зависшее чтение, сообщает об отсутствии свежего состояния и повторяет запрос", async () => {
    mocks.request.mockReturnValueOnce(new Promise(() => {}));
    mocks.request.mockResolvedValue(conversation("running"));
    const { result, setError } = setup();
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    const signal = mocks.request.mock.calls[0][1].signal as AbortSignal;
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(signal.aborted).toBe(true);
    expect(setError).toHaveBeenCalledWith(
      expect.stringContaining("Состояние выполнения пока не обновлено"),
    );
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    expect(result.current.detail?.changeRequests[0].execution.job?.status).toBe(
      "running",
    );
  });

  it("не читает скрытую страницу и возобновляется при возвращении", async () => {
    let hidden = true;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    mocks.request.mockResolvedValue(conversation("running"));
    const { result } = setup();
    await act(() => vi.advanceTimersByTimeAsync(6_000));
    expect(mocks.request).not.toHaveBeenCalled();
    hidden = false;
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(result.current.detail?.changeRequests[0].execution.job?.status).toBe(
      "running",
    );
  });
});
