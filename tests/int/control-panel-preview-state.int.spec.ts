/**
 * @file tests/int/control-panel-preview-state.int.spec.ts
 * @version 1.1.0
 * @date 2026-11-22
 * @description Проверяет контролируемую тему, сохранность controller и синхронизацию preview с history.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { createElement as h, useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemAdminTemplateProvider } from "../../src/components/admin/system-shell/SystemAdminTemplateProvider.component";
import { useSystemAdminTemplate } from "../../src/components/admin/system-shell/useSystemAdminTemplate.hook";
import { useControlPanelPreview } from "../../src/components/admin/control-panel-preview/useControlPanelPreview.hook";
import { parseControlPanelPreviewQuery } from "../../src/components/admin/control-panel-preview/parseControlPanelPreviewQuery.validator";

const selection = {
  templateId: "realizeai-control-panel",
  templateVersion: "0.1.0",
  target: "admin",
  paletteId: "realizeai-control-panel",
  paletteVersion: "0.1.0",
  mode: "light",
} as const;
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

/** Fixture сохраняет локальный ввод при обновлении контекста оформления. */
function Probe() {
  const { mode, setMode } = useSystemAdminTemplate();
  const [draft, setDraft] = useState("");
  return h(
    "div",
    null,
    h("input", {
      "aria-label": "Черновик",
      value: draft,
      onChange: (e) => setDraft(e.currentTarget.value),
    }),
    h("output", { "aria-label": "Режим" }, mode),
    h("button", { onClick: () => setMode("dark") }, "Тёмная"),
  );
}

describe("Provider и controller preview", () => {
  it("сохраняет uncontrolled mode для существующих потребителей", () => {
    const view = render(
      h(SystemAdminTemplateProvider, { selection }, h(Probe)),
    );
    fireEvent.click(screen.getByRole("button", { name: "Тёмная" }));
    view.rerender(h(SystemAdminTemplateProvider, { selection }, h(Probe)));
    expect(screen.getByLabelText("Режим").textContent).toBe("dark");
  });
  it("не меняет controlled mode самостоятельно и сохраняет ввод после обновления родителя", () => {
    const change = vi.fn();
    const view = render(
      h(
        SystemAdminTemplateProvider,
        { selection, mode: "light", onModeChange: change },
        h(Probe),
      ),
    );
    const input = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Черновик",
    });
    fireEvent.change(input, { target: { value: "Сохранить ввод" } });
    fireEvent.click(screen.getByRole("button", { name: "Тёмная" }));
    expect(change).toHaveBeenCalledWith("dark");
    expect(screen.getByLabelText("Режим").textContent).toBe("light");
    view.rerender(
      h(
        SystemAdminTemplateProvider,
        { selection, mode: "dark", onModeChange: change },
        h(Probe),
      ),
    );
    expect(screen.getByLabelText("Режим").textContent).toBe("dark");
    expect(screen.getByRole("textbox", { name: "Черновик" })).toBe(input);
    expect(input.value).toBe("Сохранить ввод");
  });
  it("не теряет быстрые изменения, отличает наследование и восстанавливает popstate", () => {
    window.history.replaceState(null, "", "/reference/control-panel");
    const hook = renderHook(() => useControlPanelPreview({ mode: "light" }));
    act(() => {
      hook.result.current.setLayoutId("without-topbar");
      hook.result.current.setMode("dark");
    });
    expect(hook.result.current.state).toEqual({
      mode: "dark",
      layoutId: "without-topbar",
    });
    expect(new URLSearchParams(window.location.search).get("layout")).toBe(
      "without-topbar",
    );
    act(() => hook.result.current.setLayoutId(undefined));
    expect(new URLSearchParams(window.location.search).has("layout")).toBe(
      false,
    );
    act(() => {
      window.history.replaceState(
        null,
        "",
        "/reference/control-panel?layout=default&mode=light",
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(hook.result.current.state).toEqual({
      mode: "light",
      layoutId: "default",
    });
  });
  it.each([
    { mode: ["light", "dark"] },
    { layout: ["default", "without-topbar"] },
    { layout: "unknown" },
    { mode: "unknown" },
  ])("отклоняет недопустимые параметры истории %j", (input) => {
    expect(parseControlPanelPreviewQuery(input)).toBeNull();
  });
});
