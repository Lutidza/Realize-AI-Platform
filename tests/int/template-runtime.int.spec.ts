/**
 * @file tests/int/template-runtime.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет публичный UI adapter, native controls, portals и сохранение черновика при смене оформления.
 * @see documentation/architecture/ui-kit.md
 */

import { createElement as h, createRef, Fragment, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UiButton,
  UiInput,
  UiTemplateProvider,
  UiTheme,
} from "@realize/ui-kit";
import type {
  UiButtonProps,
  UiInputProps,
  UiTemplateProviderProps,
} from "@realize/ui-kit";
import type {
  TemplatePaletteDefinition,
  TemplateThemeStyle,
  TemplateUiAdapter,
} from "@realize/template-contracts/react";

/** Fixture предоставляет самостоятельные native controls без повторного вызова UI dispatcher. */
function FixtureButton({
  variant,
  size,
  disabledAppearance,
  ...props
}: UiButtonProps) {
  return h("button", {
    ...props,
    "data-fixture-adapter": "button",
    "data-fixture-variant": variant,
    "data-fixture-size": size,
    "data-fixture-disabled-appearance": disabledAppearance,
  });
}

function FixtureInput(props: UiInputProps) {
  return h("input", { ...props, "data-fixture-adapter": "input" });
}

const fixtureUi = {
  Button: FixtureButton,
  Input: FixtureInput,
} satisfies TemplateUiAdapter;
const fixturePalette = {
  id: "fixture-palette",
  version: "1.0.0",
  className: "fixture-palette-v1",
  modes: ["light", "dark"],
} satisfies TemplatePaletteDefinition;
const fixtureStyle: TemplateThemeStyle = {
  "--fixture-accent": "rebeccapurple",
};
const fixtureRuntime = {
  templateId: "fixture-template",
  templateVersion: "2.1.0",
  palette: fixturePalette,
  ui: fixtureUi,
  style: fixtureStyle,
} satisfies Omit<UiTemplateProviderProps, "children">;

function withAdapter(active: boolean, children: ReactNode) {
  return active
    ? h(UiTemplateProvider, fixtureRuntime, children)
    : h(Fragment, null, children);
}

const portalTargets: HTMLElement[] = [];
afterEach(() => {
  cleanup();
  for (const target of portalTargets) target.remove();
  portalTargets.length = 0;
});

describe("Публичный template UI runtime", () => {
  it.each([false, true])(
    "собирает native controls в SSR; active adapter=%s",
    (active) => {
      const markup = renderToStaticMarkup(
        withAdapter(
          active,
          h(
            Fragment,
            null,
            h(UiButton, { type: "submit", disabled: true }, "Сохранить"),
            h(UiInput, {
              name: "title",
              defaultValue: "Черновик",
              "aria-label": "Название",
              disabled: true,
            }),
          ),
        ),
      );
      const fragment = document.createElement("template");
      fragment.innerHTML = markup;
      const button = fragment.content.querySelector("button");
      const input = fragment.content.querySelector("input");
      expect(fragment.content.children.length).toBe(2);
      expect(button?.type).toBe("submit");
      expect(button?.disabled).toBe(true);
      expect(input?.name).toBe("title");
      expect(input?.value).toBe("Черновик");
      expect(input?.disabled).toBe(true);
      expect(button?.getAttribute("data-fixture-adapter")).toBe(
        active ? "button" : null,
      );
      expect(input?.getAttribute("data-fixture-adapter")).toBe(
        active ? "input" : null,
      );
    },
  );

  it.each([false, true])(
    "сохраняет события, ref и disabled; active adapter=%s",
    (active) => {
      const buttonRef = createRef<HTMLButtonElement>();
      const inputRef = createRef<HTMLInputElement>();
      const click = vi.fn();
      const change = vi.fn();
      const controls = (disabled: boolean) =>
        withAdapter(
          active,
          h(
            Fragment,
            null,
            h(
              UiButton,
              {
                ref: buttonRef,
                type: "button",
                variant: "secondary",
                disabled,
                onClick: click,
              },
              "Сохранить",
            ),
            h(UiInput, {
              ref: inputRef,
              name: "title",
              "aria-label": "Название",
              "aria-describedby": "title-help",
              disabled,
              onChange: (event) => change(event.currentTarget.value),
            }),
            h("span", { id: "title-help" }, "Укажите название"),
          ),
        );
      const view = render(controls(true));
      const button = screen.getByRole<HTMLButtonElement>("button", {
        name: "Сохранить",
      });
      const input = screen.getByRole<HTMLInputElement>("textbox", {
        name: "Название",
      });
      expect(buttonRef.current).toBe(button);
      expect(inputRef.current).toBe(input);
      expect(button.disabled).toBe(true);
      expect(input.disabled).toBe(true);
      fireEvent.click(button);
      expect(click).not.toHaveBeenCalled();

      view.rerender(controls(false));
      expect(buttonRef.current).toBe(button);
      expect(inputRef.current).toBe(input);
      expect(button.disabled).toBe(false);
      expect(input.disabled).toBe(false);
      expect(input.getAttribute("aria-describedby")).toBe("title-help");
      fireEvent.change(input, { target: { value: "Новая задача" } });
      expect(change).toHaveBeenCalledWith("Новая задача");
      fireEvent.click(button);
      expect(click).toHaveBeenCalledTimes(1);
      act(() => inputRef.current?.focus());
      expect(document.activeElement).toBe(input);
      expect(button.getAttribute("data-fixture-adapter")).toBe(
        active ? "button" : null,
      );
      expect(input.getAttribute("data-fixture-adapter")).toBe(
        active ? "input" : null,
      );
      if (active)
        expect(button.getAttribute("data-fixture-variant")).toBe("secondary");
    },
  );

  it("не добавляет DOM вокруг содержимого provider", () => {
    const view = render(
      h(
        UiTemplateProvider,
        fixtureRuntime,
        h("main", { "data-testid": "provider-content" }, "Рабочая область"),
      ),
    );
    expect(view.container.children.length).toBe(1);
    expect(view.container.firstElementChild).toBe(
      screen.getByTestId("provider-content"),
    );
  });

  it("передаёт выбранную palette, identity и tokens в React portal", () => {
    const target = document.createElement("div");
    portalTargets.push(target);
    document.body.append(target);
    const localStyle: TemplateThemeStyle = {
      "--fixture-local": "12px",
    };
    const view = render(
      h(
        UiTemplateProvider,
        fixtureRuntime,
        h(
          Fragment,
          null,
          h(UiTheme, { mode: "dark", ...{ "data-testid": "workspace-theme" } }),
          createPortal(
            h(
              UiTheme,
              {
                mode: "dark",
                style: localStyle,
                ...{ "data-testid": "portal-theme" },
              },
              h(UiButton, { type: "button" }, "Действие в окне"),
            ),
            target,
          ),
        ),
      ),
    );
    const workspace = screen.getByTestId("workspace-theme");
    const portal = screen.getByTestId("portal-theme");
    expect(view.container.contains(portal)).toBe(false);
    expect(target.contains(portal)).toBe(true);
    for (const theme of [workspace, portal]) {
      expect(theme.classList.contains(fixturePalette.className)).toBe(true);
      expect(theme.getAttribute("data-ui-template")).toBe("fixture-template");
      expect(theme.getAttribute("data-ui-template-version")).toBe("2.1.0");
      expect(theme.getAttribute("data-ui-palette")).toBe("fixture-palette");
      expect(theme.getAttribute("data-ui-palette-version")).toBe("1.0.0");
      expect(theme.getAttribute("data-ui-theme")).toBe("dark");
      expect(theme.style.getPropertyValue("--fixture-accent")).toBe(
        "rebeccapurple",
      );
    }
    expect(portal.style.getPropertyValue("--fixture-local")).toBe("12px");
    expect(
      screen
        .getByRole("button", { name: "Действие в окне" })
        .getAttribute("data-fixture-adapter"),
    ).toBe("button");
  });

  it("сохраняет управляемый черновик и ключ controller при смене palette/mode", () => {
    const initialize = vi.fn(() => crypto.randomUUID());
    const save = vi.fn();
    const view = render(
      h(
        UiTemplateProvider,
        fixtureRuntime,
        h(DraftController, { mode: "light", initialize, save }),
      ),
    );
    const input = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Черновик",
    });
    fireEvent.change(input, { target: { value: "Сохранить эту работу" } });
    const commandKey = screen.getByLabelText("Ключ команды").textContent;
    const nextStyle: TemplateThemeStyle = { "--fixture-accent": "teal" };

    view.rerender(
      h(
        UiTemplateProvider,
        {
          ...fixtureRuntime,
          palette: {
            ...fixturePalette,
            version: "1.1.0",
            className: "fixture-palette-v2",
          },
          style: nextStyle,
        },
        h(DraftController, { mode: "dark", initialize, save }),
      ),
    );
    expect(screen.getByRole("textbox", { name: "Черновик" })).toBe(input);
    expect(input.value).toBe("Сохранить эту работу");
    expect(screen.getByLabelText("Ключ команды").textContent).toBe(commandKey);
    expect(initialize).toHaveBeenCalledTimes(1);
    const theme = screen.getByTestId("draft-theme");
    expect(theme.classList.contains("fixture-palette-v2")).toBe(true);
    expect(theme.classList.contains("fixture-palette-v1")).toBe(false);
    expect(theme.getAttribute("data-ui-palette-version")).toBe("1.1.0");
    expect(theme.getAttribute("data-ui-theme")).toBe("dark");
    expect(theme.style.getPropertyValue("--fixture-accent")).toBe("teal");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));
    expect(save).toHaveBeenCalledWith(commandKey, "Сохранить эту работу");
  });
});

/** Controller сохраняет доменное состояние независимо от значений оформления provider. */
function DraftController({
  mode,
  initialize,
  save,
}: {
  mode: "light" | "dark";
  initialize: () => string;
  save: (commandKey: string, draft: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [commandKey] = useState(initialize);
  return h(
    UiTheme,
    { mode, ...{ "data-testid": "draft-theme" } },
    h(UiInput, {
      "aria-label": "Черновик",
      value: draft,
      onChange: (event) => setDraft(event.currentTarget.value),
    }),
    h("output", { "aria-label": "Ключ команды" }, commandKey),
    h(
      UiButton,
      { type: "button", onClick: () => save(commandKey, draft) },
      "Сохранить черновик",
    ),
  );
}
