/**
 * @file tests/int/useChatDraftContext.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-12
 * @description Проверяет загрузку, повтор, удаление и безопасный перенос контекста чата.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_ATTACHMENT_LIMITS } from "@realize/ai-contracts";
import { useChatDraftContext } from "../../packages/payload-ai-plugin/src/admin/chat/useChatDraftContext.hook";
import { parseChatWindowMessage } from "../../packages/payload-ai-plugin/src/admin/chat-presentation/parseChatWindowMessage.validator";
const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  capabilities: vi.fn(),
  page: vi.fn(),
}));
vi.mock(
  "../../packages/payload-ai-plugin/src/admin/chat/chatContextAPI.adapter",
  () => ({
    uploadChatAttachment: mocks.upload,
    removeChatAttachment: mocks.remove,
    loadChatCapabilities: mocks.capabilities,
    loadChatPageDraft: mocks.page,
  }),
);
const attachment = {
  id: "asset-1",
  name: "image.png",
  kind: "image" as const,
  mimeType: "image/png",
  size: 6,
  url: "/api/realize-ai/chat/attachments/asset-1/file",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:preview");
      static revokeObjectURL = vi.fn();
    },
  );
  mocks.capabilities.mockResolvedValue({
    attachments: { ...CHAT_ATTACHMENT_LIMITS, available: true },
    projectFiles: { available: true, maxFiles: 10 },
    webSearch: { available: true },
  });
  mocks.remove.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("контекст черновика", () => {
  it("переносит только ссылку на выбранную ревизию, сохраняет выбор при ошибке и не стирает новую страницу поздним успешным send", async () => {
    const first = { id: "11", title: "Первая", fingerprint: "a".repeat(64) };
    const next = { id: "12", title: "Вторая", fingerprint: "b".repeat(64) };
    mocks.page
      .mockResolvedValueOnce({
        page: { id: first.id, title: first.title },
        fingerprint: first.fingerprint,
        fields: [{ path: "title", value: "Контент не переносится" }],
      })
      .mockRejectedValueOnce(new Error("Версия недоступна"))
      .mockResolvedValueOnce({
        page: { id: next.id, title: next.title },
        fingerprint: next.fingerprint,
      });
    const { result } = renderHook(() => useChatDraftContext(false));
    await act(() => result.current.selectPageDraft(first.id));
    const sent = result.current.readReadyContext();
    expect(sent.pageDraft).toEqual(first);
    expect(JSON.stringify(sent)).not.toContain("Контент не переносится");
    await act(() => result.current.selectPageDraft(next.id));
    expect(result.current.pageDraft).toEqual(first);
    expect(result.current.error).toBe("Версия недоступна");
    await act(() => result.current.selectPageDraft(next.id));
    act(() => result.current.clearSentContext(sent));
    expect(result.current.pageDraft).toEqual(next);
    act(() =>
      result.current.clearSentContext(result.current.readReadyContext()),
    );
    expect(result.current.pageDraft).toBeUndefined();
  });
  it("не применяет запоздавшее чтение страницы после явного удаления или восстановления handoff", async () => {
    let finish!: (value: unknown) => void;
    mocks.page.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useChatDraftContext(false));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.selectPageDraft("11");
    });
    expect(result.current.isSelectingPageDraft).toBe(true);
    const selected = {
      id: "12",
      title: "Из другого окна",
      fingerprint: "b".repeat(64),
    };
    act(() =>
      result.current.restoreContext({
        attachments: [],
        projectFiles: [],
        webSearch: false,
        pageDraft: selected,
      }),
    );
    await act(async () => {
      finish({
        page: { id: "11", title: "Старый выбор" },
        fingerprint: "a".repeat(64),
      });
      await pending;
    });
    expect(result.current.pageDraft).toEqual(selected);
    expect(result.current.isSelectingPageDraft).toBe(false);
    act(() => result.current.removePageDraft());
    expect(result.current.readReadyContext().pageDraft).toBeUndefined();
  });
  it("показывает фактический прогресс, сохраняет ошибку для повторной загрузки и освобождает превью после отправки", async () => {
    let fail!: (error: Error) => void;
    let finish!: (value: typeof attachment) => void;
    let progress!: (value: number) => void;
    mocks.upload
      .mockImplementationOnce((_file, onProgress) => {
        progress = onProgress;
        return {
          promise: new Promise((_resolve, reject) => {
            fail = reject;
          }),
          cancel: vi.fn(),
        };
      })
      .mockImplementationOnce(() => ({
        promise: new Promise((resolve) => {
          finish = resolve;
        }),
        cancel: vi.fn(),
      }));
    const { result } = renderHook(() => useChatDraftContext(true));
    await waitFor(() => expect(result.current.capabilities).toBeTruthy());
    act(() =>
      result.current.addAttachments([
        new File(["sample"], "image.png", { type: "image/png" }),
      ]),
    );
    expect(result.current.hasPendingAttachments).toBe(true);
    act(() => progress(43));
    expect(result.current.attachments[0]?.progress).toBe(43);
    await act(async () => fail(new Error("Нет соединения")));
    expect(result.current.hasFailedAttachments).toBe(true);
    const clientId = result.current.attachments[0]!.clientId;
    act(() => result.current.retryAttachment(clientId));
    await act(async () => finish(attachment));
    expect(result.current.readReadyContext().attachments).toEqual([attachment]);
    expect(result.current.hasPendingAttachments).toBe(false);
    act(() =>
      result.current.clearSentContext(result.current.readReadyContext()),
    );
    expect(result.current.attachments).toEqual([]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("не теряет готовую ссылку при ошибке удаления и повторяет явное удаление", async () => {
    const { result } = renderHook(() => useChatDraftContext(false));
    act(() =>
      result.current.restoreContext({
        attachments: [attachment],
        projectFiles: [],
        webSearch: false,
      }),
    );
    mocks.remove.mockRejectedValueOnce(new Error("Сбой"));
    await act(() => result.current.removeAttachment(attachment.id));
    expect(result.current.attachments[0]?.attachment).toEqual(attachment);
    expect(result.current.attachments[0]?.error).toContain(
      "Повторите удаление",
    );
    await act(() => result.current.removeAttachment(attachment.id));
    expect(result.current.attachments).toEqual([]);
  });
  it("принимает известный текстовый extension несмотря на системный video/mp2t MIME и отклоняет PDF", async () => {
    mocks.upload.mockReturnValue({
      promise: new Promise(() => {}),
      cancel: vi.fn(),
    });
    const { result } = renderHook(() => useChatDraftContext(true));
    await waitFor(() => expect(result.current.capabilities).toBeTruthy());
    act(() =>
      result.current.addAttachments([
        new File(["const a=1"], "example.ts", { type: "video/mp2t" }),
        new File(["%PDF"], "secret.pdf", { type: "application/pdf" }),
      ]),
    );
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(result.current.attachments[0]?.file?.name).toBe("example.ts");
    expect(result.current.error).toContain("secret.pdf");
  });
});
describe("межоконный контекст", () => {
  const state = {
    draft: "Проверь",
    context: {
      attachments: [attachment],
      projectFiles: [{ path: "src/app.ts", size: 10, sha256: "a".repeat(64) }],
      webSearch: true,
    },
  };
  it("принимает готовые bounded DTO и отклоняет внешние URL, blob и traversal", () => {
    expect(
      parseChatWindowMessage({ type: "realize-chat-state", state }),
    ).toEqual({ type: "realize-chat-state", state });
    for (const url of [
      "https://other.example/file",
      "blob:preview",
      "javascript:alert(1)",
    ])
      expect(
        parseChatWindowMessage({
          type: "realize-chat-state",
          state: {
            ...state,
            context: {
              ...state.context,
              attachments: [{ ...attachment, url }],
            },
          },
        }),
      ).toBeUndefined();
    expect(
      parseChatWindowMessage({
        type: "realize-chat-state",
        state: {
          ...state,
          context: {
            ...state.context,
            projectFiles: [
              { ...state.context.projectFiles[0], path: "../.env" },
            ],
          },
        },
      }),
    ).toBeUndefined();
  });
});
