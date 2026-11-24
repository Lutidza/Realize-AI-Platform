/**
 * @file tests/int/control-panel-template.int.spec.ts
 * @version 1.2.2
 * @date 2026-11-17
 * @description Проверяет наследование настроек, совместимость и ограничения первого preview Control Panel.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { UiButton } from "@realize/ui-kit";
import {
  resolveTemplateSelection,
  type TemplateSettings,
} from "@realize/template-contracts";
import type { TemplateAdminWorkspaceProps } from "@realize/template-contracts/react";
import { realizeTemplateManifest } from "@realize/template-realize/manifest";
import { controlPanelManifest } from "@realize/template-realizeai-control-panel/manifest";
import { controlPanelDefinition } from "@realize/template-realizeai-control-panel/admin";
import schema from "../../packages/template-realizeai-control-panel/settings.schema.json";
import { controlPanelSettingsSchema } from "../../packages/template-realizeai-control-panel/src/settings/controlPanelSettings.schemas";
import { resolveControlPanelSettings } from "@realize/template-realizeai-control-panel/settings";

const model: TemplateAdminWorkspaceProps = {
  target: "admin",
  screen: "workspace",
  mode: "light",
  paletteId: "realizeai-control-panel",
  settings: {},
  navigation: [],
  activeNavigationId: "",
  content: null,
};

describe("Первый срез Control Panel", () => {
  it("сохраняет различие наследования и явного выбора после повторной нормализации", () => {
    const inherited = resolveControlPanelSettings({});
    expect(inherited).not.toHaveProperty("layoutId");
    expect(resolveControlPanelSettings(inherited)).not.toHaveProperty(
      "layoutId",
    );
    expect(resolveControlPanelSettings({ layoutId: "default" })).toHaveProperty(
      "layoutId",
      "default",
    );
  });

  it("передаёт toolbar appearance template adapter без утечки неизвестного prop в DOM", () => {
    const template = document.createElement("template");
    template.innerHTML = renderToStaticMarkup(
      createElement(controlPanelDefinition.Renderer, {
        ...model,
        context: createElement(
          UiButton,
          { appearance: "toolbar", variant: "ghost" },
          "Предпросмотр",
        ),
      }),
    );
    const button = template.content.querySelector("header button");
    expect(button?.getAttribute("data-template-primitive")).toBe(
      "control-panel-button",
    );
    expect(button?.getAttribute("data-ui-appearance")).toBe("toolbar");
    expect(button?.hasAttribute("appearance")).toBe(false);
    expect(button?.textContent).toBe("Предпросмотр");
  });

  it("принимает второй макет без изменения остальных настроек", () => {
    expect(resolveControlPanelSettings({ layoutId: "without-topbar" })).toEqual(
      {
        layoutId: "without-topbar",
        density: "comfortable",
        panelWidth: 280,
      },
    );
  });

  it.each([undefined, "default", "without-topbar"] as const)(
    "отображает структуру выбранного макета %s",
    (layoutId) => {
      const template = document.createElement("template");
      template.innerHTML = renderToStaticMarkup(
        createElement(controlPanelDefinition.Renderer, {
          ...model,
          settings: layoutId === undefined ? {} : { layoutId },
          context: layoutId === "without-topbar" ? null : "Topbar marker",
          brand: "Brand marker",
          content: "Content marker",
        }),
      );
      const shell = template.content.querySelector(
        "[data-control-panel-layout]",
      );
      expect(shell?.getAttribute("data-control-panel-layout")).toBe(
        layoutId ?? "default",
      );
      expect(
        shell?.querySelector('[data-panel-region="topbar"]') === null,
      ).toBe(layoutId === "without-topbar");
      expect(
        shell?.querySelector('[data-panel-region="panel-content"]')
          ?.textContent,
      ).toBe("Content marker");
      expect(
        shell?.querySelector('[data-panel-region="rail"]')?.textContent,
      ).toContain("Brand marker");
    },
  );

  it.each<TemplateSettings>([
    { layoutId: "unknown" },
    { execute: "arbitrary" },
    { panelWidth: 219 },
    { panelWidth: 401 },
    { panelWidth: 280.5 },
  ])("отклоняет неподдержанные настройки %j", (input) => {
    expect(() => resolveControlPanelSettings(input)).toThrow();
  });

  it("генерирует JSON Schema из того же источника, не подставляя layoutId default", () => {
    const { $id, ...generated } = schema;
    expect($id).toBe("urn:realize:realizeai-control-panel:settings:1.1.0");
    expect(generated).toEqual(
      z.toJSONSchema(controlPanelSettingsSchema, {
        target: "draft-2020-12",
        io: "input",
      }),
    );
  });

  it.each([realizeTemplateManifest, controlPanelManifest])(
    "разрешает точный выпуск $id без подмены legacy",
    (manifest) => {
      const palette = manifest.palettes[0];
      const resolved = resolveTemplateSelection({
        manifests: [realizeTemplateManifest, controlPanelManifest],
        selection: {
          templateId: manifest.id,
          templateVersion: manifest.version,
          target: "admin",
          paletteId: palette.id,
          paletteVersion: palette.version,
          mode: "light",
        },
        host: {
          contractVersion: "1.0",
          platformVersion: "1.0.0",
          reactVersion: "19.2.8",
          nextVersion: "16.4.5",
        },
      });
      expect(resolved.manifest.id).toBe(manifest.id);
    },
  );

  it("связывает объявленный default с renderer и не маскирует отсутствие модульной интеграции", () => {
    expect(
      controlPanelDefinition.layouts.find(
        (item) => item.id === controlPanelDefinition.defaultLayoutId,
      )?.Component,
    ).toBeTypeOf("function");
    expect(() =>
      renderToStaticMarkup(
        createElement(controlPanelDefinition.Renderer, {
          ...model,
          navigation: [{ id: "documents", label: "Документы", icon: null }],
        }),
      ),
    ).toThrow("empty shell preview only");
  });
});
