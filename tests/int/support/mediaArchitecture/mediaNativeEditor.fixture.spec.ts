/**
 * @file tests/int/support/mediaArchitecture/mediaNativeEditor.fixture.spec.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Проверяет публичный native EditUpload как сборщик геометрии рецепта без отправки исходника.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaNativeEditorFixture } from "./mediaNativeEditor.fixture";

// В jsdom отсутствует Next route; сам editor, переводы и modal provider остаются настоящими.
vi.mock("next/navigation.js", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Payload public EditUpload integration", () => {
  it("ожидает изображение и возвращает crop/focal через onSave, не запуская upload", () => {
    const onSave = vi.fn();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { container } = render(
      createElement(MediaNativeEditorFixture, {
        fileName: "master.jpg",
        fileSrc: "/api/proof-sources/file/master.jpg",
        initialCrop: { unit: "%", x: 0, y: 0, width: 100, height: 100 },
        initialFocalPoint: { x: 50, y: 50 },
        onSave,
      }),
    );
    const save = screen.getByRole("button", {
      name: "Apply Changes",
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    const image = container.querySelector("img")!;
    Object.defineProperties(image, {
      naturalWidth: { value: 1600 },
      naturalHeight: { value: 1000 },
    });
    fireEvent.load(image);
    expect(save.disabled).toBe(false);
    const width = container.querySelector('input[name="Width (px)"]')!;
    const height = container.querySelector('input[name="Height (px)"]')!;
    fireEvent.change(width, { target: { value: "800" } });
    fireEvent.change(height, { target: { value: "500" } });
    fireEvent.change(container.querySelector('input[name="X %"]')!, {
      target: { value: "25" },
    });
    fireEvent.change(container.querySelector('input[name="Y %"]')!, {
      target: { value: "20" },
    });
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      crop: { unit: "%", x: 0, y: 0, width: 50, height: 50 },
      focalPoint: { x: 25, y: 20 },
      widthInPixels: 800,
      heightInPixels: 500,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("Cancel не сохраняет геометрию и не меняет master через сеть", () => {
    const onSave = vi.fn();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(
      createElement(MediaNativeEditorFixture, {
        fileName: "master.jpg",
        fileSrc: "/api/proof-sources/file/master.jpg",
        onSave,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
