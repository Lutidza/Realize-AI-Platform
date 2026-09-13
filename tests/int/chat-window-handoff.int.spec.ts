/**
 * @file tests/int/chat-window-handoff.int.spec.ts
 * @version 1.4.0
 * @date 2026-09-12
 * @description Проверяет границы передачи состояния чата и ожидание загрузки перед закрытием popup.
 */

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatWindowOptions } from "../../packages/payload-ai-plugin/src/admin/chat-presentation/ChatPresentation.types";
import { parseChatWindowMessage } from "../../packages/payload-ai-plugin/src/admin/chat-presentation/parseChatWindowMessage.validator";
import { useChatWindow } from "../../packages/payload-ai-plugin/src/admin/chat-presentation/useChatWindow.hook";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const state = { conversationID: "conv-42", draft: "Неотправленный черновик" };
const options = (): ChatWindowOptions => ({
  isWindow: false,
  windowURL: "/control/ai/window",
  readState: () => state,
  receiveState: vi.fn(async () => undefined),
  openHere: vi.fn(),
  onError: vi.fn(),
});

describe("межоконный handoff чата", () => {
  it("сохраняет одну выбранную страницу без содержимого и отклоняет подмешанный snapshot", () => {
    const pageDraft = {
      id: "42",
      title: "О компании",
      slug: "about",
      fingerprint: "a".repeat(64),
    };
    const context = {
      attachments: [],
      projectFiles: [],
      webSearch: false,
      pageDraft,
    };
    const message = {
      type: "realize-chat-state",
      state: { ...state, context },
    };
    expect(parseChatWindowMessage(message)).toEqual(message);
    for (const invalid of [
      null,
      [],
      { ...pageDraft, id: "../42" },
      { ...pageDraft, fingerprint: "old" },
      { ...pageDraft, title: "x".repeat(1001) },
      { ...pageDraft, fields: [] },
      { ...pageDraft, instructions: "override" },
      { ...pageDraft, raw: {} },
    ]) {
      expect(
        parseChatWindowMessage({
          ...message,
          state: { ...state, context: { ...context, pageDraft: invalid } },
        }),
      ).toBeUndefined();
    }
  });
  it("переносит точный выбор профиля и отклоняет подмешанные инструкции", () => {
    const agentConfigurationSelection = {
      releaseID: "release-3",
      manifestHash: "a".repeat(64),
      profileKey: "catalog.editor",
    };
    const selected = { ...state, agentConfigurationSelection };
    expect(
      parseChatWindowMessage({ type: "realize-chat-state", state: selected }),
    ).toEqual({ type: "realize-chat-state", state: selected });
    expect(
      parseChatWindowMessage({
        type: "realize-chat-state",
        state: {
          ...selected,
          agentConfigurationSelection: {
            ...agentConfigurationSelection,
            instructions: "override",
          },
        },
      }),
    ).toBeUndefined();
  });
  it("сохраняет незавершённый JSON workflow draft и его исходную привязку профиля", () => {
    const profile = {
      releaseID: "old",
      manifestHash: "a".repeat(64),
      profileKey: "original",
    };
    const workflowDraft = {
      key: "workflow.key",
      inputText: '{"unfinished":',
      profile,
    };
    const selected = { ...state, workflowDraft };
    expect(
      parseChatWindowMessage({ type: "realize-chat-state", state: selected }),
    ).toEqual({ type: "realize-chat-state", state: selected });
    expect(
      parseChatWindowMessage({
        type: "realize-chat-return",
        mode: "panel",
        requestID: "return-2",
        state: selected,
      }),
    ).toEqual({
      type: "realize-chat-return",
      mode: "panel",
      requestID: "return-2",
      state: selected,
    });
    const empty = {
      ...state,
      workflowDraft: { key: "", inputText: "невалидный отложенный текст" },
    };
    expect(
      parseChatWindowMessage({ type: "realize-chat-state", state: empty }),
    ).toEqual({ type: "realize-chat-state", state: empty });
  });
  it.each([
    {
      key: "../flow",
      inputText: "",
      profile: {
        releaseID: "r",
        manifestHash: "a".repeat(64),
        profileKey: "p",
      },
    },
    { key: "flow", inputText: "" },
    { key: "", inputText: "x".repeat(131073) },
    { key: "", inputText: {}, checkpoint: {} },
    { key: "", inputText: "", outputs: {} },
    { key: "", inputText: "", instructions: "override" },
    {
      key: "flow",
      inputText: "",
      profile: {
        releaseID: "r",
        manifestHash: "a".repeat(64),
        profileKey: "p",
        instructions: "override",
      },
    },
  ])(
    "отклоняет расширение полномочий и выход за границы workflow draft: %#",
    (workflowDraft) => {
      expect(
        parseChatWindowMessage({
          type: "realize-chat-state",
          state: { ...state, workflowDraft },
        }),
      ).toBeUndefined();
    },
  );
  it("принимает только ограниченный ID, draft и известные типы сообщений", () => {
    expect(
      parseChatWindowMessage({ type: "realize-chat-state", state }),
    ).toEqual({ type: "realize-chat-state", state });
    for (const invalid of [
      { type: "realize-chat-state", state: { ...state, credential: "secret" } },
      {
        type: "realize-chat-state",
        state: { ...state, draft: "x".repeat(8_001) },
      },
      {
        type: "realize-chat-state",
        state: { ...state, conversationID: "../other" },
      },
      {
        type: "realize-chat-return",
        state,
        mode: "https://example.test",
        requestID: "1",
      },
      { type: "realize-chat-send", state },
    ])
      expect(parseChatWindowMessage(invalid)).toBeUndefined();
  });

  it("popup открыт синхронно на своём URL; заблокированное окно не открывает другой режим", () => {
    const input = options();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { result } = renderHook(() => useChatWindow(input));
    expect(result.current.openWindow()).toBe(false);
    expect(open).toHaveBeenCalledWith(
      new URL(input.windowURL, window.location.origin).href,
      "realize-ai-chat",
      expect.any(String),
    );
    expect(input.openHere).not.toHaveBeenCalled();
  });

  it("проверяет и origin, и конкретный popup, а ACK отправляет после загрузки состояния", async () => {
    let resolve!: () => void;
    const receiving = new Promise<void>((done) => {
      resolve = done;
    });
    const input = options();
    input.receiveState = vi.fn(() => receiving);
    const popup = {
      closed: false,
      focus: vi.fn(),
      postMessage: vi.fn(),
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);
    const { result } = renderHook(() => useChatWindow(input));
    result.current.openWindow();
    vi.mocked(popup.postMessage).mockClear();
    const data = {
      type: "realize-chat-return",
      requestID: "return-1",
      mode: "panel",
      state,
    };
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://other.test",
          source: popup,
          data,
        }),
      );
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          source: window,
          data,
        }),
      );
    });
    expect(input.receiveState).not.toHaveBeenCalled();
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          source: popup,
          data,
        }),
      );
    });
    expect(input.receiveState).toHaveBeenCalledWith(state);
    expect(input.openHere).not.toHaveBeenCalled();
    expect(popup.postMessage).not.toHaveBeenCalled();
    vi.spyOn(window, "focus").mockImplementation(() => undefined);
    await act(async () => {
      resolve();
      await receiving;
    });
    expect(input.openHere).toHaveBeenCalledWith("panel");
    expect(popup.postMessage).toHaveBeenCalledWith(
      { type: "realize-chat-returned", requestID: "return-1" },
      window.location.origin,
    );
  });

  it("повторное открытие живого popup сохраняет его локальный черновик", () => {
    const input = options();
    const popup = {
      closed: false,
      focus: vi.fn(),
      postMessage: vi.fn(),
    } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(popup);
    const { result } = renderHook(() => useChatWindow(input));
    result.current.openWindow();
    vi.mocked(popup.postMessage).mockClear();
    result.current.openWindow();
    expect(open).toHaveBeenCalledOnce();
    expect(popup.postMessage).not.toHaveBeenCalled();
    expect(result.current.focusExistingWindow()).toBe(true);
    Object.defineProperty(popup, "closed", { value: true });
    expect(result.current.focusExistingWindow()).toBe(false);
    result.current.openWindow();
    expect(open).toHaveBeenCalledTimes(2);
  });
});
