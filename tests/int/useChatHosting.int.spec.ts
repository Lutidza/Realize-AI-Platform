/**
 * @file tests/int/useChatHosting.int.spec.ts
 * @version 1.0.1
 * @date 2026-09-11
 * @description Проверяет перенос режима workflow с черновиком и блокировку потери неподтверждённых запросов.
 */

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatWindowOptions } from "../../packages/payload-ai-plugin/src/admin/chat-presentation/ChatPresentation.types";
import { useChatHosting } from "../../packages/payload-ai-plugin/src/admin/chat-presentation/useChatHosting.hook";

const mocks = vi.hoisted(() => {
  const profile = {
    releaseID: "release",
    manifestHash: "a".repeat(64),
    profileKey: "profile",
  };
  return {
    pathname: "/admin/ai",
    options: undefined as ChatWindowOptions | undefined,
    push: vi.fn(),
    openWindow: vi.fn(() => true),
    returnToParent: vi.fn(),
    controller: {
      selectedConversationID: "chat",
      draft: "Черновик",
      isSubmitting: false,
      isCreatingConversation: false,
      pendingWorkflowConversationID: undefined as string | undefined,
      setDraft: vi.fn(),
      openConversation: vi.fn(async (_id: string) => {}),
      clearConversationSelection: vi.fn(),
      agentConfiguration: { selection: profile, restoreSelection: vi.fn() },
      context: {
        readReadyContext: vi.fn(() => ({
          attachments: [],
          projectFiles: [],
          webSearch: false,
        })),
        restoreContext: vi.fn(),
        hasPendingAttachments: false,
        hasFailedAttachments: false,
      },
      workflow: {
        readDraft: vi.fn(() => ({
          key: "flow",
          inputText: '{"unfinished":',
          profile,
        })),
        restoreDraft: vi.fn(),
        isPending: false,
        pendingConversationID: undefined as string | undefined,
      },
    },
  };
});
vi.mock("@payloadcms/ui", () => ({
  useConfig: () => ({ config: { routes: { admin: "/admin" } } }),
}));
vi.mock("next/navigation.js", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("../../packages/payload-ai-plugin/src/admin/useRealizeAIChat", () => ({
  useRealizeAIChat: () => mocks.controller,
}));
vi.mock(
  "../../packages/payload-ai-plugin/src/admin/chat-presentation/useCodexChatSettings.hook",
  () => ({
    useCodexChatSettings: () => ({
      settings: { displayMode: "panel" },
      isLoading: false,
      refreshSettings: vi.fn(),
    }),
  }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/admin/chat-presentation/useChatWindow.hook",
  () => ({
    useChatWindow: (options: ChatWindowOptions) => {
      mocks.options = options;
      return {
        openWindow: mocks.openWindow,
        returnToParent: mocks.returnToParent,
        focusExistingWindow: () => false,
      };
    },
  }),
);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = "/admin/ai";
  mocks.controller.workflow.isPending = false;
  mocks.controller.workflow.pendingConversationID = undefined;
  mocks.controller.pendingWorkflowConversationID = undefined;
});
afterEach(cleanup);

describe("Hosting workflow draft", () => {
  it("переносит профиль, исходную привязку процесса и незавершённый JSON вместе с сообщением", async () => {
    renderHook(() => useChatHosting({ route: "/ai" }));
    const state = mocks.options!.readState();
    expect(state.workflowDraft).toEqual(mocks.controller.workflow.readDraft());
    expect(state.draft).toBe("Черновик");
    expect(state.agentConfigurationSelection).toEqual(
      mocks.controller.agentConfiguration.selection,
    );
    await act(() => mocks.options!.receiveState(state));
    expect(mocks.controller.openConversation).toHaveBeenCalledWith("chat");
    expect(mocks.controller.workflow.restoreDraft).toHaveBeenCalledWith(
      state.workflowDraft,
    );
    expect(
      mocks.controller.agentConfiguration.restoreSelection,
    ).toHaveBeenCalledWith(state.agentConfigurationSelection);
    expect(mocks.controller.setDraft).toHaveBeenCalledWith("Черновик");
  });
  it("восстанавливает workflow draft даже после ошибки чтения conversation, а обычный handoff явно сбрасывает выбор", async () => {
    renderHook(() => useChatHosting({ route: "/ai" }));
    const state = mocks.options!.readState();
    mocks.controller.openConversation.mockRejectedValueOnce(
      new Error("Offline"),
    );
    await act(async () => {
      await expect(mocks.options!.receiveState(state)).rejects.toThrow(
        "Offline",
      );
    });
    expect(mocks.controller.workflow.restoreDraft).toHaveBeenCalledWith(
      state.workflowDraft,
    );
    await act(() => mocks.options!.receiveState({ draft: "Обычный чат" }));
    expect(mocks.controller.clearConversationSelection).toHaveBeenCalled();
    expect(mocks.controller.workflow.restoreDraft).toHaveBeenLastCalledWith(
      undefined,
    );
  });
  it.each(["start", "continue", "inflight"] as const)(
    "не переносит неподтверждённый запрос %s в другое окно",
    (kind) => {
      if (kind === "start")
        mocks.controller.pendingWorkflowConversationID = "chat";
      else if (kind === "continue")
        mocks.controller.workflow.pendingConversationID = "chat";
      else mocks.controller.workflow.isPending = true;
      const { result } = renderHook(() => useChatHosting({ route: "/ai" }));
      act(() => result.current.presentation.openChat("window"));
      expect(mocks.openWindow).not.toHaveBeenCalled();
      expect(result.current.presentation.notice).toBeTruthy();
    },
  );
  it("pending retry сохраняется при перемещении страницы в панель в том же provider", () => {
    mocks.controller.workflow.pendingConversationID = "chat";
    const { result } = renderHook(() => useChatHosting({ route: "/ai" }));
    act(() => result.current.presentation.openChat("panel"));
    expect(mocks.push).toHaveBeenCalledWith("/admin");
    expect(mocks.openWindow).not.toHaveBeenCalled();
  });
  it("popup не закрывается с неподтверждённым продолжением", () => {
    mocks.pathname = "/admin/ai/window";
    mocks.controller.workflow.pendingConversationID = "chat";
    const { result } = renderHook(() => useChatHosting({ route: "/ai" }));
    act(() => result.current.presentation.closeChat());
    expect(mocks.returnToParent).not.toHaveBeenCalled();
    expect(result.current.presentation.notice).toContain("Повторите");
  });
});
