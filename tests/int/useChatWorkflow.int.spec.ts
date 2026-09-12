/**
 * @file tests/int/useChatWorkflow.int.spec.ts
 * @version 1.0.1
 * @date 2026-09-11
 * @description Проверяет checkpoint, явный выбор процесса и безопасный повтор продолжения в чате.
 */

import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationDetailDTO, RunDTO } from "@realize/ai-contracts";
import { useChatWorkflow } from "../../packages/payload-ai-plugin/src/admin/chat/useChatWorkflow.hook";
import { getChatWorkflowRuns } from "../../packages/payload-ai-plugin/src/admin/chat/getChatWorkflowRuns.util";
import { parseChatWorkflowInput } from "../../packages/payload-ai-plugin/src/admin/chat/parseChatWorkflowInput.validator";
import type { ChatWorkflowOptions } from "../../packages/payload-ai-plugin/src/admin/chat/ChatWorkflow.types";
import { RealizeAIRequestError } from "../../packages/payload-ai-plugin/src/admin/RealizeAIRequest.error";

const request = vi.hoisted(() => vi.fn());
vi.mock("../../packages/payload-ai-plugin/src/admin/realizeAIAPI", () => ({
  requestRealizeAI: request,
}));
const createdAt = "2026-09-11T10:00:00.000Z";
const runFor = (overrides: Partial<RunDTO> = {}): RunDTO => ({
  id: "parent",
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
    stepType: "agent_turn",
    version: 2,
    completedSteps: 1,
    phase: "ready",
  },
  ...overrides,
});
const detailFor = (runs: RunDTO[] = [runFor()]): ConversationDetailDTO => ({
  conversation: {
    id: "chat",
    title: "Процессы",
    status: "active",
    createdAt,
    updatedAt: createdAt,
    lastMessageAt: createdAt,
  },
  runs,
  messages: [],
  dataOperations: [],
  changeRequests: [],
});
const optionsFor = (
  overrides: Partial<ChatWorkflowOptions> = {},
): ChatWorkflowOptions => ({
  configuration: {
    catalog: {
      activePointer: null,
      release: { id: "release", version: 1, manifestHash: "a".repeat(64) },
      profiles: [
        {
          key: "profile",
          title: "Профиль",
          description: "",
          locale: "ru",
          defaultWorkflowKey: "flow",
          workflows: [{ key: "flow", title: "Процесс", description: "" }],
        },
      ],
    },
    selection: {
      releaseID: "release",
      profileKey: "profile",
      manifestHash: "a".repeat(64),
    },
    isLoading: false,
    isReady: true,
    refresh: vi.fn(async () => {}),
    selectProfile: vi.fn(),
    restoreSelection: vi.fn(),
  },
  detail: detailFor(),
  ready: true,
  enabled: true,
  busy: false,
  draft: "Ответ",
  hasContext: false,
  setDraft: vi.fn(),
  setError: vi.fn(),
  acceptResult: vi.fn(),
  refreshConversation: vi.fn(async () => detailFor()),
  ...overrides,
});
beforeEach(() => {
  request.mockReset();
});
afterEach(cleanup);

describe("Выбор процесса", () => {
  it("defaultWorkflowKey не запускается автоматически; смена профиля сохраняет устаревший выбор и JSON", () => {
    const options = optionsFor();
    const { result, rerender } = renderHook((props) => useChatWorkflow(props), {
      initialProps: options,
    });
    expect(result.current.readStart()).toBeUndefined();
    act(() => {
      result.current.select("flow");
      result.current.setInputText('{"count":2}');
    });
    expect(result.current.readStart()).toEqual({
      key: "flow",
      input: { count: 2 },
    });
    rerender({
      ...options,
      configuration: {
        ...options.configuration,
        selection: { ...options.configuration.selection!, profileKey: "other" },
      },
    });
    expect(result.current.isSelectionReady).toBe(false);
    expect(result.current.inputText).toBe('{"count":2}');
    expect(() => result.current.readStart()).toThrow("текущего профиля");
    act(() => result.current.select(""));
    expect(result.current.readStart()).toBeUndefined();
  });
  it.each(["{", "[]", "null", '{"request":"override"}'])(
    "некорректный JSON не скрывается и не отправляется: %s",
    (input) => {
      const { result } = renderHook(() => useChatWorkflow(optionsFor()));
      act(() => {
        result.current.select("flow");
        result.current.setInputText(input);
      });
      expect(() => result.current.readStart()).toThrow();
      expect(result.current.inputText).toBe(input);
      expect(request).not.toHaveBeenCalled();
    },
  );
  it("handoff восстанавливает raw JSON и исходный профиль без адаптации к текущему выбору", () => {
    const options = optionsFor();
    const { result, rerender } = renderHook((props) => useChatWorkflow(props), {
      initialProps: options,
    });
    act(() => {
      result.current.select("flow");
      result.current.setInputText('{"unfinished":');
    });
    const draft = result.current.readDraft();
    expect(draft.profile).toEqual(options.configuration.selection);
    rerender({
      ...options,
      configuration: {
        ...options.configuration,
        selection: { ...options.configuration.selection!, profileKey: "other" },
      },
    });
    act(() => result.current.restoreDraft(draft));
    expect(result.current.inputText).toBe('{"unfinished":');
    expect(result.current.key).toBe("flow");
    expect(result.current.isSelectionReady).toBe(false);
    act(() => result.current.restoreDraft(undefined));
    expect(result.current.key).toBe("");
    expect(result.current.inputText).toBe("");
  });
  it("пустые данные остаются необязательными, размер и JSON контракты проверяются общим validator", () => {
    expect(parseChatWorkflowInput("flow", " ")).toEqual({ key: "flow" });
    expect(() =>
      parseChatWorkflowInput("flow", " ".repeat(131073) + "{}"),
    ).toThrow("128 КиБ");
  });
});

describe("Продолжение checkpoint", () => {
  it("не запускается автоматически, ready передаёт только версию/шаг, mutex исключает двойной POST", async () => {
    const options = optionsFor();
    let complete!: (value: unknown) => void;
    request.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { result } = renderHook(() => useChatWorkflow(options));
    expect(request).not.toHaveBeenCalled();
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.continue();
      void result.current.continue();
    });
    expect(request).toHaveBeenCalledTimes(1);
    const [path, init] = request.mock.calls[0]!;
    expect(path).toBe("/runs/parent/workflow/continue");
    expect(JSON.parse(init.body)).toEqual({
      expectedVersion: 2,
      expectedStepKey: "answer",
    });
    expect(init.headers["Idempotency-Key"]).toBeTruthy();
    await act(async () => {
      complete({ run: runFor({ id: "child" }) });
      await pending;
    });
    expect(options.acceptResult).toHaveBeenCalledTimes(1);
    expect(options.refreshConversation).toHaveBeenCalledWith("chat");
    expect(options.setDraft).not.toHaveBeenCalled();
  });
  it("сохраняет exact ключ/тело после потери ответа и не очищает новый текст при повторе", async () => {
    const parent = runFor();
    parent.workflow = {
      ...parent.workflow!,
      phase: "awaiting_input",
      stepType: "request_input",
    };
    const options = optionsFor({ detail: detailFor([parent]) });
    request
      .mockRejectedValueOnce(new TypeError("Offline"))
      .mockResolvedValueOnce({ run: runFor({ id: "child" }) });
    const { result } = renderHook(() => {
      const [draft, setDraft] = useState("Исходный ответ");
      return {
        draft,
        setDraft,
        workflow: useChatWorkflow({ ...options, draft, setDraft }),
      };
    });
    await act(() => result.current.workflow.continue());
    expect(result.current.draft).toBe("Исходный ответ");
    expect(result.current.workflow.hasRetry).toBe(true);
    act(() => result.current.setDraft("Новый текст"));
    await act(() => result.current.workflow.continue());
    const first = request.mock.calls[0]![1];
    const second = request.mock.calls[1]![1];
    expect(second.body).toBe(first.body);
    expect(second.headers).toEqual(first.headers);
    expect(JSON.parse(second.body).content).toBe("Исходный ответ");
    expect(result.current.draft).toBe("Новый текст");
    expect(result.current.workflow.hasRetry).toBe(false);
  });
  it("409 сохраняет ввод, запрещает повтор до обновления и восстанавливает последний child", async () => {
    const options = optionsFor();
    const child = runFor({
      id: "child",
      workflow: { ...runFor().workflow!, parentRunID: "parent", version: 3 },
    });
    vi.mocked(options.refreshConversation).mockResolvedValue(
      detailFor([child, runFor()]),
    );
    request.mockRejectedValue(
      new RealizeAIRequestError("Версия изменилась", { status: 409 }),
    );
    const { result, rerender } = renderHook((props) => useChatWorkflow(props), {
      initialProps: options,
    });
    await act(() => result.current.continue());
    expect(result.current.canContinue).toBe(false);
    expect(result.current.hasRetry).toBe(false);
    expect(options.setDraft).not.toHaveBeenCalled();
    await act(() => result.current.continue());
    expect(request).toHaveBeenCalledTimes(1);
    await act(() => result.current.refresh());
    rerender({ ...options, detail: detailFor([runFor(), child]) });
    expect(result.current.run?.id).toBe("child");
    expect(result.current.canContinue).toBe(true);
  });
  it("429 сохраняет запрос для повтора после ограничения частоты", async () => {
    request.mockRejectedValue(
      new RealizeAIRequestError("Повторите позднее", { status: 429 }),
    );
    const { result } = renderHook(() => useChatWorkflow(optionsFor()));
    await act(() => result.current.continue());
    expect(result.current.hasRetry).toBe(true);
    expect(result.current.error).toBe("Повторите позднее");
  });
  it("режим обычного чата оставляет ожидание; новый child снова предлагает ответ", () => {
    const run = runFor({
      workflow: { ...runFor().workflow!, phase: "awaiting_input" },
    });
    const options = optionsFor({ detail: detailFor([run]) });
    const { result, rerender } = renderHook((props) => useChatWorkflow(props), {
      initialProps: options,
    });
    expect(result.current.isReplying).toBe(true);
    act(() => result.current.setReplying(false));
    expect(result.current.isReplying).toBe(false);
    expect(result.current.run?.id).toBe("parent");
    const child = {
      ...run,
      id: "child",
      workflow: { ...run.workflow!, parentRunID: "parent" },
    };
    rerender({ ...options, detail: detailFor([child, run]) });
    expect(result.current.isReplying).toBe(true);
  });
  it("ожидание не принимает вложения и пустой ответ; исторический профиль не требует актуального каталога", async () => {
    const parent = runFor({
      workflow: { ...runFor().workflow!, phase: "awaiting_input" },
    });
    const options = optionsFor({
      detail: detailFor([parent]),
      hasContext: true,
    });
    const { result, rerender } = renderHook((props) => useChatWorkflow(props), {
      initialProps: options,
    });
    await act(() => result.current.continue());
    expect(result.current.error).toContain("только текст");
    rerender({ ...options, hasContext: false, draft: " " });
    await act(() => result.current.continue());
    expect(result.current.error).toContain("Введите ответ");
    expect(request).not.toHaveBeenCalled();
    rerender({
      ...options,
      hasContext: false,
      configuration: { ...options.configuration, isReady: false },
    });
    expect(result.current.canContinue).toBe(true);
  });
  it.each(["cancelled", "failed", "running", "queued"] as const)(
    "запуск %s не продолжается",
    async (status) => {
      const { result } = renderHook(() =>
        useChatWorkflow(
          optionsFor({ detail: detailFor([runFor({ status })]) }),
        ),
      );
      await act(() => result.current.continue());
      expect(result.current.canContinue).toBe(false);
      expect(request).not.toHaveBeenCalled();
    },
  );
  it.each(["completed", "blocked", "running"] as const)(
    "фаза %s не принимает continue",
    (phase) => {
      const run = runFor({ workflow: { ...runFor().workflow!, phase } });
      const { result } = renderHook(() =>
        useChatWorkflow(optionsFor({ detail: detailFor([run]) })),
      );
      expect(result.current.canContinue).toBe(false);
    },
  );
  it.each([{ enabled: false }, { ready: false }, { busy: true }])(
    "не продолжает при недоступности: %o",
    async (overrides) => {
      const { result } = renderHook(() =>
        useChatWorkflow(optionsFor(overrides)),
      );
      await act(() => result.current.continue());
      expect(request).not.toHaveBeenCalled();
    },
  );
  it("сохраняет доступ к двум процессам и после продолжения остаётся на выбранном root", () => {
    const older = runFor({
      id: "older",
      createdAt: "2026-09-11T09:00:00.000Z",
    });
    const newer = runFor({ id: "newer" });
    const options = optionsFor({ detail: detailFor([older, newer]) });
    const { result, rerender } = renderHook((props) => useChatWorkflow(props), {
      initialProps: options,
    });
    expect(result.current.runs).toHaveLength(2);
    expect(result.current.run?.id).toBe("newer");
    act(() => result.current.selectRun("older"));
    expect(result.current.run?.id).toBe("older");
    const child = runFor({
      id: "older-child",
      workflow: {
        ...older.workflow!,
        parentRunID: "older",
        rootRunID: "older",
        version: 3,
      },
    });
    rerender({ ...options, detail: detailFor([newer, child, older]) });
    expect(result.current.runs).toHaveLength(2);
    expect(result.current.run?.id).toBe("older-child");
  });
  it("durable child подтверждает потерянный ответ и снимает устаревший retry без повторного POST", async () => {
    const parent = runFor();
    const options = optionsFor();
    request.mockRejectedValue(new TypeError("Offline"));
    const { result, rerender } = renderHook((props) => useChatWorkflow(props), {
      initialProps: options,
    });
    await act(() => result.current.continue());
    expect(result.current.hasRetry).toBe(true);
    const child = runFor({
      id: "child",
      workflow: {
        ...parent.workflow!,
        rootRunID: "parent",
        parentRunID: "parent",
        version: 3,
      },
    });
    rerender({ ...options, detail: detailFor([parent, child]) });
    expect(result.current.hasRetry).toBe(false);
    expect(result.current.run?.id).toBe("child");
    act(() => result.current.select("flow"));
    expect(result.current.readStart()).toEqual({ key: "flow" });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("смена диалога сохраняет адрес неподтверждённого запроса и не переносит его ошибку", async () => {
    request.mockRejectedValue(new TypeError("Offline"));
    const options = optionsFor();
    const { result, rerender } = renderHook((props) => useChatWorkflow(props), {
      initialProps: options,
    });
    await act(() => result.current.continue());
    const next = detailFor([
      runFor({ id: "other-run", conversationID: "other" }),
    ]);
    next.conversation.id = "other";
    rerender({ ...options, detail: next });
    expect(result.current.pendingConversationID).toBe("chat");
    expect(result.current.error).toBeUndefined();
    expect(result.current.canContinue).toBe(false);
    await act(() => result.current.continue());
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("queued workflow после reload повторяет тот же сегмент без сообщения, несмотря на active queued run", async () => {
    const queued = runFor({
      status: "queued",
      workflow: { ...runFor().workflow!, phase: "running" },
    });
    const options = optionsFor({
      detail: detailFor([queued]),
      currentRun: queued,
    });
    request.mockResolvedValue({ run: queued });
    const { result } = renderHook(() => useChatWorkflow(options));
    expect(result.current.canContinue).toBe(true);
    await act(() => result.current.continue());
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![0]).toBe("/runs/parent/workflow/continue");
    expect(JSON.parse(request.mock.calls[0]![1].body)).toEqual({
      expectedVersion: 2,
      expectedStepKey: "answer",
    });
    expect(options.acceptResult).toHaveBeenCalledWith({ run: queued }, "chat");
    expect(options.setDraft).not.toHaveBeenCalled();
  });
  it("другой active run блокирует даже queued recovery выбранного процесса", () => {
    const queued = runFor({
      status: "queued",
      workflow: { ...runFor().workflow!, phase: "running" },
    });
    const active = runFor({
      id: "ordinary",
      status: "running",
      workflow: undefined,
    });
    const { result } = renderHook(() =>
      useChatWorkflow(
        optionsFor({ detail: detailFor([queued]), currentRun: active }),
      ),
    );
    expect(result.current.canContinue).toBe(false);
  });
  it("архивный диалог остаётся доступен только для чтения", () => {
    const detail = detailFor();
    detail.conversation.status = "archived";
    const { result } = renderHook(() =>
      useChatWorkflow(optionsFor({ detail })),
    );
    expect(result.current.canContinue).toBe(false);
  });
});

describe("Выбор последнего workflow run", () => {
  it("child замещает parent при равных датах и любом порядке; активный DTO обновляет сохранённый", () => {
    const parent = runFor();
    const child = runFor({
      id: "child",
      workflow: { ...parent.workflow!, parentRunID: "parent", version: 3 },
    });
    expect(getChatWorkflowRuns([child, parent])[0]?.id).toBe("child");
    expect(getChatWorkflowRuns([parent, child])[0]?.id).toBe("child");
    expect(
      getChatWorkflowRuns([parent, child], { ...child, status: "running" })[0]
        ?.status,
    ).toBe("running");
  });
});

it("новый диалог без runs разрешает выбрать процесс без ложного retry", () => {
  const { result } = renderHook(() =>
    useChatWorkflow(optionsFor({ detail: undefined, currentRun: undefined })),
  );
  expect(result.current.hasRetry).toBe(false);
  expect(result.current.isPending).toBe(false);
  act(() => result.current.select("flow"));
  expect(result.current.key).toBe("flow");
  expect(result.current.isSelectionReady).toBe(true);
  expect(result.current.readStart()).toEqual({ key: "flow" });
  expect(request).not.toHaveBeenCalled();
});
