/**
 * @file tests/int/pageDraftPicker.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Проверяет поиск и пагинацию страниц, явное чтение ревизии и защиту от поздних результатов.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageDraftPicker } from "../../packages/payload-ai-plugin/src/admin/chat/PageDraftPicker.component";
import { useChatDraftContext } from "../../packages/payload-ai-plugin/src/admin/chat/useChatDraftContext.hook";
import { usePageDraftPicker } from "../../packages/payload-ai-plugin/src/admin/chat/usePageDraftPicker.hook";

const mocks = vi.hoisted(() => ({ search: vi.fn(), load: vi.fn() }));
vi.mock(
  "../../packages/payload-ai-plugin/src/admin/chat/chatContextAPI.adapter",
  () => ({
    searchChatPageDrafts: mocks.search,
    loadChatPageDraft: mocks.load,
    loadChatCapabilities: vi.fn(),
    uploadChatAttachment: vi.fn(),
    removeChatAttachment: vi.fn(),
  }),
);
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("Выбор страницы CMS", () => {
  it("запрашивает ограниченную страницу каталога, сбрасывает номер при поиске и читает snapshot только после явного выбора", async () => {
    mocks.search.mockImplementation(async (query: string, page: number) => ({
      pages: [
        {
          id: String(page),
          title: query || `Страница ${page}`,
          slug: `page-${page}`,
        },
      ],
      page,
      totalPages: 3,
      totalDocs: 51,
    }));
    mocks.load.mockResolvedValue({
      page: { id: "1", title: "О компании" },
      fingerprint: "a".repeat(64),
      fields: [{ value: "Секретный текст не выводится в picker" }],
    });
    const Harness = () => {
      const context = useChatDraftContext(false);
      return createElement(PageDraftPicker, { context, disabled: false });
    };
    const { container } = render(createElement(Harness));
    await screen.findByRole("button", {
      name: "Выбрать страницу «Страница 1»",
    });
    expect(mocks.load).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Следующая страница результатов CMS",
      }),
    );
    await screen.findByRole("button", {
      name: "Выбрать страницу «Страница 2»",
    });
    expect(mocks.search).toHaveBeenLastCalledWith(
      "",
      2,
      expect.any(AbortSignal),
    );
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Поиск страниц CMS" }),
      { target: { value: "О компании" } },
    );
    const selected = await screen.findByRole("button", {
      name: "Выбрать страницу «О компании»",
    });
    expect(mocks.search).toHaveBeenLastCalledWith(
      "О компании",
      1,
      expect.any(AbortSignal),
    );
    fireEvent.click(selected);
    await waitFor(() =>
      expect(selected.getAttribute("aria-pressed")).toBe("true"),
    );
    expect(mocks.load).toHaveBeenCalledWith("1", expect.any(AbortSignal));
    expect(container.textContent).not.toContain("Секретный текст");
  });
  it("отменённый ответ поиска не заменяет результат нового запроса", async () => {
    let finish!: (value: unknown) => void;
    mocks.search.mockImplementation((query: string) =>
      query === ""
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve({
            pages: [{ id: "new", title: "Новая" }],
            page: 1,
            totalPages: 1,
            totalDocs: 1,
          }),
    );
    const { result } = renderHook(() => usePageDraftPicker());
    await waitFor(() => expect(mocks.search).toHaveBeenCalledOnce());
    const originalSignal = mocks.search.mock.calls[0]![2] as AbortSignal;
    act(() => result.current.setQuery("Новая"));
    await waitFor(() => expect(result.current.pages[0]?.id).toBe("new"));
    expect(originalSignal.aborted).toBe(true);
    await act(async () =>
      finish({
        pages: [{ id: "old", title: "Старый ответ" }],
        page: 1,
        totalPages: 8,
        totalDocs: 190,
      }),
    );
    expect(result.current.pages).toEqual([{ id: "new", title: "Новая" }]);
    expect(result.current.totalDocs).toBe(1);
  });
});
