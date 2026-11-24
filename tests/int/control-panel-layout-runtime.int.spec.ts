/**
 * @file tests/int/control-panel-layout-runtime.int.spec.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Проверяет exact metadata bindings и сохранность content при смене настоящего renderer.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { createElement, useEffect, useState, type ChangeEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createTemplateLayoutCatalog } from "@realize/template-contracts/layouts/server";
import { resolveTemplateLayout } from "@realize/template-contracts";
import type { TemplateLayoutCatalogInput } from "@realize/template-contracts";
import type { TemplatePresentationProps } from "@realize/template-contracts/react";
import {
  controlPanelDefinition,
  ControlPanelWithoutTopbarLayout,
} from "@realize/template-realizeai-control-panel/admin";
import {
  controlPanelLayoutCatalog,
  controlPanelLayoutIds,
  controlPanelLayoutLabels,
} from "@realize/template-realizeai-control-panel/layouts";
import { resolveControlPanelSettings } from "@realize/template-realizeai-control-panel/settings";
import { assertControlPanelLayoutBindings } from "../../packages/template-realizeai-control-panel/src/assertControlPanelLayoutBindings.validator";
import { realizeTemplateLayoutCatalog } from "../../src/registry/realizeTemplateLayoutCatalog.config";

afterEach(cleanup);
const Renderer = controlPanelDefinition.Renderer;
const base: TemplatePresentationProps = {
  target: "admin",
  screen: "workspace",
  mode: "light",
  paletteId: "realizeai-control-panel",
  settings: {},
  navigation: [],
  activeNavigationId: "",
  content: null,
};

describe("Два layout definitions Control Panel 0.1.0", () => {
  it("разрешает существующие aliases в exact самостоятельные версии и общий Frame", () => {
    expect(
      controlPanelLayoutCatalog.descriptors.map((item) => item.version),
    ).toEqual(["0.1.0", "0.1.0"]);
    const inherited = resolveTemplateLayout(controlPanelLayoutCatalog);
    const explicit = resolveTemplateLayout(
      controlPanelLayoutCatalog,
      "default",
    );
    expect(inherited.reference).toEqual(explicit.reference);
    expect(inherited.localId).toBe("default");
    expect(resolveControlPanelSettings({})).not.toHaveProperty("layoutId");
    expect(resolveControlPanelSettings({ layoutId: "default" })).toHaveProperty(
      "layoutId",
      "default",
    );
    expect(() => resolveControlPanelSettings({ layoutId: null })).toThrow();
    expect(controlPanelDefinition.layouts[0].Component).toBe(
      controlPanelDefinition.layouts[1].Component,
    );
    expect(
      controlPanelDefinition.layouts.map((item) => item.frameProps.hasTopbar),
    ).toEqual([true, false]);
    expect(Object.isFrozen(controlPanelLayoutIds)).toBe(true);
    expect(Object.isFrozen(controlPanelLayoutLabels)).toBe(true);
  });

  it("отклоняет неполные, неверные и дублированные compiled bindings", () => {
    const entries = controlPanelDefinition.layouts;
    expect(() =>
      assertControlPanelLayoutBindings(controlPanelLayoutCatalog, entries),
    ).not.toThrow();
    expect(() =>
      assertControlPanelLayoutBindings(
        controlPanelLayoutCatalog,
        entries.slice(0, 1),
      ),
    ).toThrow();
    expect(() =>
      assertControlPanelLayoutBindings(controlPanelLayoutCatalog, [
        entries[0],
        entries[0],
      ]),
    ).toThrow();
    expect(() =>
      assertControlPanelLayoutBindings(controlPanelLayoutCatalog, [
        {
          ...entries[0],
          reference: { ...entries[0].reference, version: "0.1.1" },
        },
        entries[1],
      ]),
    ).toThrow();
    expect(() =>
      assertControlPanelLayoutBindings(controlPanelLayoutCatalog, [
        {
          ...entries[0],
          frameProps: { ...entries[0].frameProps, hasTopbar: false },
        },
        entries[1],
      ]),
    ).toThrow();
    expect(() =>
      assertControlPanelLayoutBindings(controlPanelLayoutCatalog, [
        { ...entries[0], Component: () => null },
        entries[1],
      ]),
    ).toThrow();
    const descriptor = Object.fromEntries(
      Object.entries(entries[0].descriptor).reverse(),
    ) as (typeof entries)[0]["descriptor"];
    const reference = {
      version: entries[0].reference.version,
      identity: {
        id: entries[0].reference.identity.id,
        namespace: entries[0].reference.identity.namespace,
      },
    };
    expect(() =>
      assertControlPanelLayoutBindings(controlPanelLayoutCatalog, [
        { ...entries[0], descriptor, reference },
        entries[1],
      ]),
    ).not.toThrow();
  });

  it("защищает выбранные pins независимым ранее полученным catalog hash", () => {
    expect(
      createTemplateLayoutCatalog(
        controlPanelLayoutCatalog,
        realizeTemplateLayoutCatalog.catalogHash,
      ).catalogHash,
    ).toBe(realizeTemplateLayoutCatalog.catalogHash);
    const changed = JSON.parse(
      JSON.stringify(controlPanelLayoutCatalog),
    ) as TemplateLayoutCatalogInput;
    changed.descriptors[0].version = "0.1.1";
    const alias = changed.aliases.find(
      (item) => item.layout.identity.id === changed.descriptors[0].identity.id,
    )!;
    alias.layout.version = "0.1.1";
    expect(() =>
      createTemplateLayoutCatalog(
        changed,
        realizeTemplateLayoutCatalog.catalogHash,
      ),
    ).toThrow(expect.objectContaining({ code: "STALE_CATALOG" }));
    expect(controlPanelLayoutCatalog.descriptors[0].version).toBe("0.1.0");
  });

  it("сохраняет локальный React state, DOM, file input, focus и scroll в полном цикле", () => {
    let mounts = 0;
    let unmounts = 0;
    function Content() {
      const [draft, setDraft] = useState("");
      const [count, setCount] = useState(0);
      useEffect(() => {
        mounts++;
        return () => {
          unmounts++;
        };
      }, []);
      return createElement(
        "section",
        null,
        createElement("input", {
          "aria-label": "local draft",
          value: draft,
          onChange: (event: ChangeEvent<HTMLInputElement>) =>
            setDraft(event.currentTarget.value),
        }),
        createElement("input", {
          "aria-label": "uncontrolled",
          defaultValue: "",
        }),
        createElement("input", { "aria-label": "file", type: "file" }),
        createElement(
          "button",
          { onClick: () => setCount((value) => value + 1) },
          `count ${count}`,
        ),
      );
    }
    const props = (layoutId?: string): TemplatePresentationProps => ({
      ...base,
      settings: layoutId ? { layoutId } : {},
      content: createElement(Content),
    });
    const view = render(createElement(Renderer, props()));
    const input = screen.getByLabelText("local draft") as HTMLInputElement;
    const uncontrolled = screen.getByLabelText(
      "uncontrolled",
    ) as HTMLInputElement;
    const fileInput = screen.getByLabelText("file") as HTMLInputElement;
    const main = view.container.querySelector(
      '[data-panel-region="panel-content"]',
    ) as HTMLElement;
    const file = new File(["layout state"], "layout-state.txt", {
      type: "text/plain",
    });
    fireEvent.change(input, { target: { value: "draft survives" } });
    fireEvent.change(uncontrolled, { target: { value: "native survives" } });
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "count 0" }));
    uncontrolled.focus();
    main.scrollTop = 117;
    const firstMounts = mounts;
    for (const layoutId of ["without-topbar", "default", undefined]) {
      view.rerender(createElement(Renderer, props(layoutId)));
      expect(screen.getByLabelText("local draft")).toBe(input);
      expect(input.value).toBe("draft survives");
      expect(screen.getByLabelText("uncontrolled")).toBe(uncontrolled);
      expect(uncontrolled.value).toBe("native survives");
      expect(screen.getByLabelText("file")).toBe(fileInput);
      expect(fileInput.files?.[0]).toBe(file);
      expect(document.activeElement).toBe(uncontrolled);
      expect(
        view.container.querySelector('[data-panel-region="panel-content"]'),
      ).toBe(main);
      expect(main.scrollTop).toBe(117);
      expect(mounts).toBe(firstMounts);
      expect(unmounts).toBe(0);
      expect(screen.getByRole("button", { name: "count 1" })).toBeTruthy();
      expect(
        view.container.querySelector('[data-panel-region="topbar"]') !== null,
      ).toBe(layoutId !== "without-topbar");
    }
  });

  it("не теряет context в отсутствующем topbar молча", () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(Renderer, {
          ...base,
          settings: { layoutId: "without-topbar" },
          context: "Required context",
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "UNSUPPORTED_SLOT" }));
    expect(() =>
      renderToStaticMarkup(
        createElement(ControlPanelWithoutTopbarLayout, {
          mode: "light",
          topbar: "Required context",
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "UNSUPPORTED_SLOT" }));
    expect(
      renderToStaticMarkup(
        createElement(Renderer, {
          ...base,
          settings: { layoutId: "without-topbar" },
          context: null,
        }),
      ),
    ).not.toContain('data-panel-region="topbar"');
  });
});
