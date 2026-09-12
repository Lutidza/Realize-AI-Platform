/**
 * @file tests/int/useChatAgentConfiguration.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет точный выбор профиля, обновление активного выпуска и масштабирование списка.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AIChatConfigurationCatalogDTO,
  AIChatConfigurationSelection,
} from "@realize/ai-contracts";
import { useChatAgentConfiguration } from "../../packages/payload-ai-plugin/src/admin/chat/useChatAgentConfiguration.hook";
import { useChatAgentConfigurationPicker } from "../../packages/payload-ai-plugin/src/admin/chat/useChatAgentConfigurationPicker.hook";

const catalogFor = (
  count: number,
  version = 1,
): AIChatConfigurationCatalogDTO => ({
  activePointer: {
    activatedAt: "2026-09-10T12:00:00.000Z",
    activatedBy: "fixture",
    releaseID: `release-${version}`,
    manifestHash: String(version).repeat(64),
    version,
  },
  release: {
    id: `release-${version}`,
    manifestHash: String(version).repeat(64),
    version,
  },
  profiles: Array.from({ length: count }, (_, index) => ({
    key: `profile.${index}`,
    title: `Профиль ${index}`,
    description: index % 2 ? "Каталог" : "Контент",
    locale: "ru",
  })),
});
let catalog: AIChatConfigurationCatalogDTO;
let fail: boolean;
const envelope = (data: unknown) =>
  Response.json({ ok: true, data, correlationID: "fixture" });
beforeEach(() => {
  catalog = catalogFor(1);
  fail = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (fail) throw new TypeError("Offline");
      return envelope(catalog);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("профиль следующего запуска", () => {
  it("сохраняет системный режим без активного выпуска и выбирает единственный профиль явно в состоянии", async () => {
    catalog = { activePointer: null, release: null, profiles: [] };
    const { result } = renderHook(() => useChatAgentConfiguration(true));
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.selection).toBeUndefined();
    catalog = catalogFor(1);
    await act(() => result.current.refresh());
    expect(result.current.selection).toEqual({
      releaseID: "release-1",
      manifestHash: "1".repeat(64),
      profileKey: "profile.0",
    });
    expect(result.current.isReady).toBe(true);
  });
  it("требует выбор при нескольких профилях и не подменяет его после смены выпуска", async () => {
    catalog = catalogFor(2);
    const { result } = renderHook(() => useChatAgentConfiguration(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isReady).toBe(false);
    act(() => result.current.selectProfile("profile.1"));
    const selected = result.current.selection;
    catalog = catalogFor(2, 2);
    await act(() => result.current.refresh());
    expect(result.current.selection).toEqual(selected);
    expect(result.current.isReady).toBe(false);
    act(() => result.current.selectProfile("profile.1"));
    expect(result.current.isReady).toBe(true);
    expect(result.current.selection?.releaseID).toBe("release-2");
  });
  it("после ошибки загрузки сохраняет выбор, а повторная загрузка восстанавливает доступность", async () => {
    const { result } = renderHook(() => useChatAgentConfiguration(true));
    await waitFor(() => expect(result.current.isReady).toBe(true));
    const selected = result.current.selection;
    fail = true;
    await act(() => result.current.refresh());
    expect(result.current.selection).toEqual(selected);
    expect(result.current.isReady).toBe(false);
    fail = false;
    await act(() => result.current.refresh());
    expect(result.current.isReady).toBe(true);
  });
  it("handoff имеет приоритет над автоматическим выбором и допускает явный сброс", async () => {
    const selected: AIChatConfigurationSelection = {
      releaseID: "release-9",
      manifestHash: "9".repeat(64),
      profileKey: "profile.0",
    };
    const { result } = renderHook(() => useChatAgentConfiguration(true));
    act(() => result.current.restoreSelection(selected));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.selection).toEqual(selected);
    expect(result.current.isReady).toBe(false);
    catalog = { activePointer: null, release: null, profiles: [] };
    await act(() => result.current.refresh());
    expect(result.current.isReady).toBe(false);
    act(() => result.current.restoreSelection(undefined));
    expect(result.current.isReady).toBe(true);
  });
  it("поздний ответ прежней загрузки не заменяет новый каталог", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { result } = renderHook(() => useChatAgentConfiguration(true));
    catalog = catalogFor(2, 2);
    await act(() => result.current.refresh());
    await act(async () => resolve(envelope(catalogFor(1))));
    expect(result.current.catalog?.release?.version).toBe(2);
    expect(result.current.selection).toBeUndefined();
  });
  it("в 512 профилях сначала ищет, затем строит страницы по 25 и ограничивает устаревшую страницу", () => {
    const { result, rerender } = renderHook(
      ({ data }) => useChatAgentConfigurationPicker(data),
      { initialProps: { data: catalogFor(512) } },
    );
    expect(result.current.pageCount).toBe(21);
    act(() => result.current.setPage(21));
    expect(result.current.rows).toHaveLength(12);
    act(() => result.current.setQuery("Каталог"));
    expect(result.current.count).toBe(256);
    expect(result.current.page).toBe(1);
    expect(result.current.rows).toHaveLength(25);
    act(() => result.current.setPage(11));
    rerender({ data: catalogFor(40) });
    expect(result.current.page).toBe(1);
    expect(result.current.rows).toHaveLength(20);
  });
});
