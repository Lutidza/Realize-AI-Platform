/**
 * @file tests/int/useRealizeAIChat.lifecycle.int.spec.ts
 * @version 1.4.0
 * @date 2026-09-12
 * @description Проверяет сохранение выбора и черновика при скрытии чата и межоконном handoff.
 */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRealizeAIChat } from "../../packages/payload-ai-plugin/src/admin/useRealizeAIChat";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  stream: vi.fn(() => ({ phase: "idle" })),
  polling: vi.fn(),
}));
vi.mock("../../packages/payload-ai-plugin/src/admin/realizeAIAPI", () => ({
  requestRealizeAI: mocks.request,
  REALIZE_AI_API_ROOT: "/api/realize-ai",
}));
vi.mock("../../packages/payload-ai-plugin/src/admin/useRunStream", () => ({
  useRunStream: mocks.stream,
}));
vi.mock(
  "../../packages/payload-ai-plugin/src/admin/useExecutionPolling",
  () => ({ useExecutionPolling: mocks.polling }),
);
vi.mock("../../packages/payload-ai-plugin/src/admin/useChangeRequests", () => ({
  useChangeRequests: () => ({}),
}));
vi.mock("../../packages/payload-ai-plugin/src/admin/useDataOperations", () => ({
  useDataOperations: () => ({}),
}));
vi.mock(
  "../../packages/payload-ai-plugin/src/admin/useSourcePromotion",
  () => ({ useSourcePromotion: () => vi.fn() }),
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.request.mockImplementation(async (path: string) => {
    if (path === "/status") return { state: "ready" };
    if (path === "/config/runtime")
      return { activePointer: null, release: null, profiles: [] };
    if (path === "/conversations") return [{ id: "first" }, { id: "selected" }];
    return {
      conversation: { id: path.split("/").at(-1) },
      messages: [],
      changeRequests: [],
      dataOperations: [],
      runs: [{ id: "run-1", conversationID: "selected", status: "running" }],
    };
  });
});
afterEach(cleanup);

describe("lifecycle общего controller чата", () => {
  it("отправляет только id/fingerprint страницы и сохраняет выбор и текст после отказа устаревшей ревизии", async () => {
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/status") return { state: "ready" };
      if (path === "/config/runtime")
        return { activePointer: null, release: null, profiles: [] };
      if (path === "/chat/capabilities")
        return { pageDrafts: { available: true } };
      if (path === "/conversations")
        return [{ id: "selected", status: "active" }];
      if (path.endsWith("/messages"))
        throw new Error("Страница изменилась. Выберите её снова.");
      return {
        conversation: { id: "selected" },
        messages: [],
        runs: [],
        changeRequests: [],
        dataOperations: [],
      };
    });
    const { result } = renderHook(() => useRealizeAIChat(true));
    await waitFor(() =>
      expect(result.current.detail?.conversation.id).toBe("selected"),
    );
    await waitFor(() =>
      expect(result.current.context.capabilities?.pageDrafts?.available).toBe(
        true,
      ),
    );
    const selected = {
      id: "42",
      title: "О компании",
      slug: "about",
      fingerprint: "a".repeat(64),
    };
    act(() => {
      result.current.setDraft("Сократи первый абзац");
      result.current.context.restoreContext({
        attachments: [],
        projectFiles: [],
        webSearch: false,
        pageDraft: selected,
      });
    });
    await act(() => result.current.send());
    const [, init] = mocks.request.mock.calls.find(([path]) =>
      path.endsWith("/messages"),
    )!;
    expect(JSON.parse(init.body)).toEqual({
      content: "Сократи первый абзац",
      attachmentIDs: [],
      projectFiles: [],
      webSearch: false,
      pageDraft: { id: selected.id, fingerprint: selected.fingerprint },
    });
    expect(result.current.context.pageDraft).toEqual(selected);
    expect(result.current.draft).toBe("Сократи первый абзац");
    expect(result.current.error).toContain("Страница изменилась");
  });
  it("после скрытия и повторного открытия сохраняет выбранный диалог и черновик", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useRealizeAIChat(enabled),
      { initialProps: { enabled: true } },
    );
    await waitFor(() =>
      expect(result.current.selectedConversationID).toBe("first"),
    );
    await act(async () => {
      await result.current.openConversation("selected");
      result.current.setDraft("Черновик");
    });
    rerender({ enabled: false });
    expect(mocks.stream).toHaveBeenLastCalledWith(
      expect.objectContaining({ run: undefined }),
    );
    expect(mocks.polling).toHaveBeenLastCalledWith(
      expect.objectContaining({ detail: undefined }),
    );
    rerender({ enabled: true });
    await waitFor(() =>
      expect(result.current.detail?.conversation.id).toBe("selected"),
    );
    expect(result.current.draft).toBe("Черновик");
    expect(result.current.selectedConversationID).toBe("selected");
  });

  it("пустой выбор handoff не подменяется первым диалогом и не создаёт серверный диалог", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useRealizeAIChat(enabled),
      { initialProps: { enabled: false } },
    );
    act(() => {
      result.current.clearConversationSelection();
      result.current.setDraft("Новый запрос");
    });
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.selectedConversationID).toBeUndefined();
    expect(result.current.draft).toBe("Новый запрос");
    expect(
      mocks.request.mock.calls.every(
        ([, input]) => !input?.method || input.method === "GET",
      ),
    ).toBe(true);
    expect(mocks.request).not.toHaveBeenCalledWith(
      "/conversations/first",
      expect.anything(),
    );
  });

  it("запоздавший ответ старого выбора не заменяет более новый", async () => {
    let complete!: (value: unknown) => void;
    mocks.request.mockImplementation((path: string) =>
      path.endsWith("/old")
        ? new Promise((resolve) => {
            complete = resolve;
          })
        : Promise.resolve({
            conversation: { id: "new" },
            runs: [],
            messages: [],
            changeRequests: [],
            dataOperations: [],
          }),
    );
    const { result } = renderHook(() => useRealizeAIChat(false));
    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.openConversation("old");
      await result.current.openConversation("new");
    });
    await act(async () => {
      complete({ conversation: { id: "old" }, runs: [] });
      await pending;
    });
    expect(result.current.selectedConversationID).toBe("new");
    expect(result.current.detail?.conversation.id).toBe("new");
  });
});

describe("отправка полного контекста черновика", () => {
  const snapshot = {
    attachments: [
      {
        id: "asset-1",
        name: "notes.txt",
        mimeType: "text/plain",
        size: 10,
        kind: "text" as const,
        url: "/api/realize-ai/chat/attachments/asset-1/file",
      },
    ],
    projectFiles: [
      { path: "src/example.ts", size: 20, sha256: "a".repeat(64) },
    ],
    webSearch: true,
  };
  it("сохраняет текст и файлы после ошибки, затем отправляет тот же контекст и очищает только после успеха", async () => {
    let fail = true;
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/status") return { state: "ready" };
      if (path === "/config/runtime")
        return { activePointer: null, release: null, profiles: [] };
      if (path === "/chat/capabilities")
        return {
          attachments: { available: false },
          projectFiles: { available: false },
          webSearch: { available: true },
        };
      if (path === "/conversations")
        return [{ id: "selected", status: "active" }];
      if (path.endsWith("/messages")) {
        if (fail) throw new Error("Сеть недоступна");
        return {
          run: { id: "run", conversationID: "selected", status: "queued" },
        };
      }
      return {
        conversation: { id: "selected" },
        messages: [],
        runs: [],
        changeRequests: [],
        dataOperations: [],
      };
    });
    const { result, rerender } = renderHook(
      ({ enabled }) => useRealizeAIChat(enabled),
      { initialProps: { enabled: true } },
    );
    await waitFor(() =>
      expect(result.current.detail?.conversation.id).toBe("selected"),
    );
    act(() => {
      result.current.setDraft("Проверь материалы");
      result.current.context.restoreContext(snapshot);
    });
    await act(() => result.current.send());
    expect(result.current.error).toBe("Сеть недоступна");
    expect(result.current.draft).toBe("Проверь материалы");
    expect(result.current.context.readReadyContext()).toEqual(snapshot);
    rerender({ enabled: false });
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.context.readReadyContext()).toEqual(snapshot);
    fail = false;
    await waitFor(() =>
      expect(result.current.agentConfiguration.isReady).toBe(true),
    );
    await act(() => result.current.send());
    const requests = mocks.request.mock.calls.filter(([path]) =>
      path.endsWith("/messages"),
    );
    expect(requests).toHaveLength(2);
    for (const [, init] of requests)
      expect(JSON.parse(init.body)).toEqual({
        content: "Проверь материалы",
        attachmentIDs: ["asset-1"],
        projectFiles: [{ path: "src/example.ts", sha256: "a".repeat(64) }],
        webSearch: true,
      });
    expect(result.current.context.readReadyContext()).toEqual({
      attachments: [],
      projectFiles: [],
      webSearch: false,
    });
    expect(result.current.draft).toBe("");
  });
});

describe("выбор конфигурации нового запуска", () => {
  const selection = {
    releaseID: "installation-config-v1",
    manifestHash: "a".repeat(64),
    profileKey: "catalog",
  };
  const catalog = {
    activePointer: {
      version: 1,
      releaseID: selection.releaseID,
      manifestHash: selection.manifestHash,
    },
    release: {
      id: selection.releaseID,
      version: 1,
      manifestHash: selection.manifestHash,
    },
    profiles: [
      { key: "catalog", title: "Каталог", description: "", locale: "ru" },
    ],
  };

  it("передаёт только выбор профиля и сохраняет текст и выбор после отклонения устаревшего выпуска", async () => {
    let nextCatalog = catalog;
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/status") return { state: "ready" };
      if (path === "/config/runtime") return nextCatalog;
      if (path === "/conversations")
        return [{ id: "selected", status: "active" }];
      if (path.endsWith("/messages"))
        throw new Error("Активный выпуск изменился. Обновите профили.");
      return {
        conversation: { id: "selected" },
        messages: [],
        runs: [],
        changeRequests: [],
        dataOperations: [],
      };
    });
    const { result } = renderHook(() => useRealizeAIChat(true));
    await waitFor(() =>
      expect(result.current.agentConfiguration.isReady).toBe(true),
    );
    await waitFor(() =>
      expect(result.current.detail?.conversation.id).toBe("selected"),
    );
    act(() => result.current.setDraft("Проверь каталог"));
    await act(() => result.current.send());
    const [, init] = mocks.request.mock.calls.find(([path]) =>
      path.endsWith("/messages"),
    )!;
    expect(JSON.parse(init.body)).toEqual({
      content: "Проверь каталог",
      attachmentIDs: [],
      projectFiles: [],
      webSearch: false,
      agentConfiguration: selection,
    });
    expect(result.current.draft).toBe("Проверь каталог");
    expect(result.current.agentConfiguration.selection).toEqual(selection);
    nextCatalog = {
      ...catalog,
      release: {
        ...catalog.release,
        id: "installation-config-v2",
        version: 2,
        manifestHash: "b".repeat(64),
      },
      activePointer: {
        version: 2,
        releaseID: "installation-config-v2",
        manifestHash: "b".repeat(64),
      },
    };
    await act(() => result.current.agentConfiguration.refresh());
    expect(result.current.agentConfiguration.isReady).toBe(false);
    await act(() => result.current.send());
    expect(
      mocks.request.mock.calls.filter(([path]) => path.endsWith("/messages")),
    ).toHaveLength(1);
    expect(result.current.draft).toBe("Проверь каталог");
  });
});

describe("Исполнение процесса через общий controller", () => {
  const createdAt = "2026-09-11T10:00:00.000Z";
  const workflow = {
    key: "flow",
    title: "Процесс",
    revision: 1,
    stepKey: "ask",
    stepType: "request_input",
    version: 2,
    completedSteps: 1,
    phase: "awaiting_input",
  };
  const parent = {
    id: "parent",
    conversationID: "selected",
    status: "completed",
    workflow,
    createdAt,
    updatedAt: createdAt,
    provider: "openai-codex",
    sandboxProfile: "analysis-readonly",
  };
  const selection = {
    releaseID: "release",
    profileKey: "profile",
    manifestHash: "a".repeat(64),
  };
  const catalog = {
    activePointer: null,
    release: { id: "release", version: 1, manifestHash: "a".repeat(64) },
    profiles: [
      {
        key: "profile",
        title: "Профиль",
        locale: "ru",
        description: "",
        defaultWorkflowKey: "flow",
        workflows: [{ key: "flow", title: "Процесс", description: "" }],
      },
    ],
  };
  const detail = (runs: unknown[] = []) => ({
    conversation: { id: "selected", status: "active" },
    runs,
    messages: [],
    changeRequests: [],
    dataOperations: [],
  });
  it("первый потерянный ответ повторяется с тем же ключом и workflow входом, сохраняя новый текст", async () => {
    let fail = true;
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/status") return { state: "ready" };
      if (path === "/config/runtime") return catalog;
      if (path === "/conversations")
        return [{ id: "selected", status: "active" }];
      if (path.endsWith("/messages")) {
        if (fail) throw new TypeError("Offline");
        return { run: parent };
      }
      return detail();
    });
    const { result } = renderHook(() => useRealizeAIChat(true));
    await waitFor(() =>
      expect(result.current.agentConfiguration.isReady).toBe(true),
    );
    await waitFor(() =>
      expect(result.current.detail?.conversation.id).toBe("selected"),
    );
    act(() => {
      result.current.workflow.select("flow");
      result.current.workflow.setInputText('{"count":2}');
      result.current.setDraft("Исходный запрос");
    });
    await act(() => result.current.send());
    expect(result.current.pendingWorkflowConversationID).toBe("selected");
    act(() => result.current.setDraft("Новый текст"));
    fail = false;
    await act(() => result.current.send());
    const calls = mocks.request.mock.calls.filter(([path]) =>
      path.endsWith("/messages"),
    );
    expect(calls).toHaveLength(2);
    expect(calls[1]![1].body).toBe(calls[0]![1].body);
    expect(calls[1]![1].headers).toEqual(calls[0]![1].headers);
    expect(JSON.parse(calls[0]![1].body)).toEqual({
      content: "Исходный запрос",
      attachmentIDs: [],
      projectFiles: [],
      webSearch: false,
      workflow: { key: "flow", input: { count: 2 } },
      agentConfiguration: selection,
    });
    expect(result.current.draft).toBe("Новый текст");
    expect(result.current.pendingWorkflowConversationID).toBeUndefined();
    expect(result.current.workflow.key).toBe("");
  });
  it("возобновляет request_input без нового профиля и после успеха очищает только отправленный ответ", async () => {
    let resumed = false;
    const child = {
      ...parent,
      id: "child",
      workflow: {
        ...workflow,
        phase: "completed",
        stepKey: "done",
        stepType: "finish",
        version: 3,
        parentRunID: "parent",
      },
    };
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/status") return { state: "ready" };
      if (path === "/config/runtime")
        return { activePointer: null, release: null, profiles: [] };
      if (path === "/conversations")
        return [{ id: "selected", status: "active" }];
      if (path.endsWith("/workflow/continue")) {
        resumed = true;
        return { run: child };
      }
      return detail(resumed ? [parent, child] : [parent]);
    });
    const { result } = renderHook(() => useRealizeAIChat(true));
    await waitFor(() => expect(result.current.workflow.isReplying).toBe(true));
    act(() => result.current.setDraft("Ответ на запрос"));
    await act(() => result.current.send());
    const calls = mocks.request.mock.calls.filter(([path]) =>
      path.endsWith("/workflow/continue"),
    );
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]![1].body)).toEqual({
      expectedVersion: 2,
      expectedStepKey: "ask",
      content: "Ответ на запрос",
    });
    expect(result.current.workflow.run?.id).toBe("child");
    expect(result.current.draft).toBe("");
    expect(
      mocks.request.mock.calls.filter(([path]) => path.endsWith("/messages")),
    ).toHaveLength(0);
  });
});
