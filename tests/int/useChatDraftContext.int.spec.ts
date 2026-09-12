/**
 * @file tests/int/useChatDraftContext.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-09
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
}));
vi.mock(
  "../../packages/payload-ai-plugin/src/admin/chat/chatContextAPI.adapter",
  () => ({
    uploadChatAttachment: mocks.upload,
    removeChatAttachment: mocks.remove,
    loadChatCapabilities: mocks.capabilities,
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
