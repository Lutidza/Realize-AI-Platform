/**
 * @file tests/int/workflowRunActions.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет общие workflow/data actions без conversation DTO, включая неизвестный результат и точный повтор.
 */

import { act, cleanup, renderHook } from "@testing-library/react";
import type { DataOperationDTO, RunDTO } from "@realize/ai-contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkflowContinuation } from "../../packages/payload-ai-plugin/src/admin/chat/useWorkflowContinuation.hook";
import type { WorkflowContinuationOptions } from "../../packages/payload-ai-plugin/src/admin/chat/WorkflowContinuation.types";
import { useDataOperationActions } from "../../packages/payload-ai-plugin/src/admin/useDataOperationActions.hook";
import { RealizeAIRequestError } from "../../packages/payload-ai-plugin/src/admin/RealizeAIRequest.error";

const request = vi.hoisted(() => vi.fn());
vi.mock("../../packages/payload-ai-plugin/src/admin/realizeAIAPI", () => ({
  requestRealizeAI: request,
}));
beforeEach(() => {
  request.mockReset();
});
afterEach(cleanup);
const runFor = (): RunDTO => ({
  id: "10",
  conversationID: "7",
  status: "completed",
  provider: "openai-codex",
  sandboxProfile: "analysis-readonly",
  createdAt: "2026-09-11T10:00:00.000Z",
  updatedAt: "2026-09-11T10:00:00.000Z",
  workflow: {
    key: "flow",
    title: "Проверка",
    revision: 1,
    rootRunID: "1",
    parentRunID: "1",
    stepKey: "question",
    stepType: "request_input",
    phase: "awaiting_input",
    version: 4,
    completedSteps: 1,
  },
});
const optionsFor = (): WorkflowContinuationOptions => {
  const run = runFor();
  return {
    run,
    runs: [run],
    conversationID: "7",
    archived: false,
    enabled: true,
    ready: true,
    busy: false,
    draft: "Тестовый ответ",
    setDraft: vi.fn(),
    acceptResult: vi.fn(),
    refresh: vi.fn(async () => run),
  };
};

describe("Continuation port карточки процесса", () => {
  it("не читает conversation и принимает результат до detail refresh для подключения SSE", async () => {
    const options = optionsFor();
    const order: string[] = [];
    options.acceptResult = vi.fn(() => {
      order.push("accepted");
    });
    options.refresh = vi.fn(async () => {
      order.push("refreshed");
      return undefined;
    });
    request.mockResolvedValue({
      run: { ...runFor(), id: "11", status: "queued" },
    });
    const { result } = renderHook(() => useWorkflowContinuation(options));
    expect(request).not.toHaveBeenCalled();
    await act(() => result.current.continue());
    expect(order).toEqual(["accepted", "refreshed"]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe("/runs/10/workflow/continue");
    expect(options.refresh).toHaveBeenCalledWith(
      expect.objectContaining({ id: "11" }),
    );
  });

  it("неопределённый ответ блокирует смену процесса и сохраняет тело после изменения draft", async () => {
    const options = optionsFor();
    request
      .mockRejectedValueOnce(new Error("Сеть недоступна"))
      .mockResolvedValueOnce({ run: runFor() });
    const { result, rerender } = renderHook(
      (value) => useWorkflowContinuation(value),
      { initialProps: options },
    );
    await act(() => result.current.continue());
    expect(result.current).toMatchObject({ hasRetry: true, isLocked: true });
    rerender({ ...options, draft: "Позднее редактирование" });
    await act(() => result.current.continue());
    expect(request.mock.calls[1][1].body).toBe(request.mock.calls[0][1].body);
    expect(request.mock.calls[1][1].headers).toEqual(
      request.mock.calls[0][1].headers,
    );
    expect(result.current.isLocked).toBe(false);
  });

  it("тот же queued run после durable продвижения снимает неизвестный recovery запрос", async () => {
    const options = optionsFor();
    const queued: RunDTO = {
      ...runFor(),
      status: "queued",
      workflow: {
        ...runFor().workflow!,
        phase: "running",
        stepType: "agent_turn",
      },
    };
    options.run = queued;
    options.runs = [queued];
    request.mockRejectedValue(new Error("503"));
    const { result, rerender } = renderHook(
      (value) => useWorkflowContinuation(value),
      { initialProps: options },
    );
    await act(() => result.current.continue());
    expect(JSON.parse(request.mock.calls[0][1].body)).not.toHaveProperty(
      "content",
    );
    const completed: RunDTO = {
      ...queued,
      status: "completed",
      workflow: { ...queued.workflow!, phase: "ready", version: 5 },
    };
    rerender({ ...options, run: completed, runs: [completed] });
    expect(result.current).toMatchObject({
      hasRetry: false,
      isLocked: false,
      canContinue: true,
    });
  });

  it("чужой detail refresh не снимает frozen request исходного корня", async () => {
    const options = optionsFor();
    request.mockRejectedValue(new Error("Offline"));
    vi.mocked(options.refresh).mockResolvedValue({
      ...runFor(),
      id: "other",
      workflow: { ...runFor().workflow!, rootRunID: "999", version: 90 },
    });
    const { result } = renderHook(() => useWorkflowContinuation(options));
    await act(() => result.current.continue());
    await act(() => result.current.refresh());
    expect(result.current.hasRetry).toBe(true);
    expect(result.current.isLocked).toBe(true);
  });

  it("успешный POST с неудачным GET не предлагает повтор уже принятого действия", async () => {
    const options = optionsFor();
    request.mockResolvedValue({ run: runFor() });
    vi.mocked(options.refresh).mockRejectedValue(new Error("Refresh offline"));
    const { result } = renderHook(() => useWorkflowContinuation(options));
    await act(() => result.current.continue());
    expect(options.acceptResult).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({
      isLocked: false,
      hasRetry: false,
      error: "Refresh offline",
    });
  });

  it.each(["archived", "disabled", "busy", "unavailable"])(
    "запрещает действие в режиме %s",
    async (mode) => {
      const options = optionsFor();
      if (mode === "archived") options.archived = true;
      if (mode === "disabled") options.enabled = false;
      if (mode === "busy") options.busy = true;
      if (mode === "unavailable") options.ready = false;
      const { result } = renderHook(() => useWorkflowContinuation(options));
      await act(() => result.current.continue());
      expect(result.current.canContinue).toBe(false);
      expect(request).not.toHaveBeenCalled();
    },
  );
});

const operation = {
  id: "41",
  conversationID: "7",
  operationHash: "a".repeat(64),
  rollbackHash: "b".repeat(64),
  version: 1,
  state: "awaiting_approval",
} as DataOperationDTO;
const dataOptions = () => ({
  commit: vi.fn(),
  setError: vi.fn(),
  setPending: vi.fn(),
});

describe("DataOperation actions без поддельной модели диалога", () => {
  it("после потерянного POST и GET повторяет исходные hash/version/key и запрещает другое действие", async () => {
    const options = dataOptions();
    request
      .mockRejectedValueOnce(new Error("POST offline"))
      .mockRejectedValueOnce(new Error("GET offline"))
      .mockResolvedValueOnce({ ...operation, version: 2, state: "approved" });
    const { result } = renderHook(() => useDataOperationActions(options));
    await act(() =>
      result.current.decideDataOperation(
        operation,
        "approve",
        "Первое решение",
      ),
    );
    expect(result.current).toMatchObject({ hasRetry: true, isLocked: true });
    await act(() => result.current.applyDataOperation(operation));
    expect(request).toHaveBeenCalledTimes(2);
    await act(() =>
      result.current.decideDataOperation(
        { ...operation, version: 9 },
        "approve",
        "Другой комментарий",
      ),
    );
    expect(request.mock.calls[2][1].body).toBe(request.mock.calls[0][1].body);
    expect(request.mock.calls[2][1].headers).toEqual(
      request.mock.calls[0][1].headers,
    );
    expect(result.current).toMatchObject({ hasRetry: false, isLocked: false });
    expect(options.commit).toHaveBeenCalledWith(
      expect.objectContaining({ state: "approved" }),
    );
  });

  it("GET прежней версии не доказывает завершение ещё исполняющегося POST", async () => {
    request
      .mockRejectedValueOnce(new Error("POST timeout"))
      .mockResolvedValueOnce(operation);
    const { result } = renderHook(() => useDataOperationActions(dataOptions()));
    await act(() => result.current.decideDataOperation(operation, "approve"));
    expect(result.current.hasRetry).toBe(true);
    request.mockResolvedValueOnce({
      ...operation,
      state: "approved",
      version: 2,
    });
    await act(() => result.current.retry());
    expect(result.current.isLocked).toBe(false);
  });

  it("GET изменившейся durable версии подтверждает согласование после неопределённого POST", async () => {
    const options = dataOptions();
    request
      .mockRejectedValueOnce(new Error("POST timeout"))
      .mockResolvedValueOnce({ ...operation, state: "approved", version: 2 });
    const { result } = renderHook(() => useDataOperationActions(options));
    await act(() => result.current.decideDataOperation(operation, "approve"));
    expect(result.current.isLocked).toBe(false);
    expect(result.current.hasRetry).toBe(false);
    expect(options.commit).toHaveBeenCalledWith(
      expect.objectContaining({ version: 2 }),
    );
  });

  it("достоверный 409 снимает retry даже при недоступном reconcile GET", async () => {
    request
      .mockRejectedValueOnce(
        new RealizeAIRequestError("Changed", { status: 409 }),
      )
      .mockRejectedValueOnce(new Error("GET offline"));
    const { result } = renderHook(() => useDataOperationActions(dataOptions()));
    await act(() => result.current.applyDataOperation(operation));
    expect(result.current).toMatchObject({ hasRetry: false, isLocked: false });
  });

  it("двойной клик не создаёт параллельные POST", async () => {
    let resolve!: (value: DataOperationDTO) => void;
    request.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { result } = renderHook(() => useDataOperationActions(dataOptions()));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.applyDataOperation(operation);
      void result.current.applyDataOperation(operation);
    });
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(operation);
      await pending;
    });
    expect(result.current.isLocked).toBe(false);
  });
});
