/**
 * @file tests/int/mediaProcessingField.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Проверяет отсутствие фоновой записи и запрет обработки несохранённого профиля.
 * @see documentation/specifications/media-management.md
 */
import { createElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaProcessingField } from "../../src/components/admin/media/MediaProcessingField.component";

const state = vi.hoisted(() => ({
  id: undefined as number | undefined,
  profile: undefined as number | undefined,
  modified: false,
  updatedAt: "2026-09-15T10:00:00Z",
}));
vi.mock("@payloadcms/ui", () => ({
  useDocumentInfo: () => ({
    id: state.id,
    data: { updatedAt: state.updatedAt },
  }),
  useConfig: () => ({ config: { routes: { api: "/custom-api" } } }),
  useField: () => ({ value: state.profile }),
  useFormModified: () => state.modified,
  useTheme: () => ({ theme: "light" }),
}));

describe("native Media processing field", () => {
  beforeEach(() => {
    state.id = undefined;
    state.profile = undefined;
    state.modified = false;
    state.updatedAt = "2026-09-15T10:00:00Z";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ original: null, sets: [], hasMore: false }),
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not request or queue processing before native Media exists", () => {
    render(createElement(MediaProcessingField));
    expect(screen.getByText(/Сохраните файл, чтобы/)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { profile: undefined, modified: false },
    { profile: 8, modified: true },
  ])("requires a saved selected profile %j", async (value) => {
    state.id = 7;
    Object.assign(state, value);
    render(createElement(MediaProcessingField));
    await act(async () => {});
    expect(
      (
        screen.getByRole("button", {
          name: "Создать варианты по текущему профилю",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      vi.mocked(fetch).mock.calls.every((call) => call[1]?.method !== "POST"),
    ).toBe(true);
  });

  it("enables the explicit action for a saved profile and uses the configured API route", async () => {
    state.id = 7;
    state.profile = 8;
    render(createElement(MediaProcessingField));
    await act(async () => {});
    expect(
      (
        screen.getByRole("button", {
          name: "Создать варианты по текущему профилю",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      "/custom-api/media/7/processing?page=1",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reloads processing after a native save without issuing another queue POST", async () => {
    state.id = 7;
    state.profile = 8;
    const view = render(createElement(MediaProcessingField));
    await act(async () => {});
    state.updatedAt = "2026-09-15T11:00:00Z";
    view.rerender(createElement(MediaProcessingField));
    await act(async () => {});
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(fetch).mock.calls.every((call) => call[1]?.method !== "POST"),
    ).toBe(true);
  });
});
