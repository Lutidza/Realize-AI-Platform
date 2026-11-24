/**
 * @file tests/int/control-panel-appearance-ui.int.spec.ts
 * @version 1.0.0
 * @date 2026-11-13
 * @description Проверяет наследование настроек, preview-only ограничения и реальные макеты в appearance UI.
 * @see documentation/specifications/extension-management.md
 */
import { createElement as h, useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { controlPanelManifest } from "@realize/template-realizeai-control-panel/manifest";
import settingsSchema from "@realize/template-realizeai-control-panel/settings.schema.json";
import type {
  ExtensionAssignment,
  ExtensionAppearancePlanDto,
  ExtensionCatalogEntryDto,
  ExtensionManagerSnapshotDto,
  InstalledTemplateEntryDto,
} from "@realize/payload-extension-manager/contracts";
import type {
  ExtensionManagerProps,
  ExtensionManagerTransport,
} from "../../src/components/admin/extensions/ExtensionManager.types";
import { ExtensionAppearanceEditor } from "../../src/components/admin/extensions/ExtensionAppearanceEditor.component";
import { ExtensionAppearancePlan } from "../../src/components/admin/extensions/ExtensionAppearancePlan.component";
import { ExtensionAppearancePreview } from "../../src/components/admin/extensions/ExtensionAppearancePreview.component";
import { ExtensionSettingsFields } from "../../src/components/admin/extensions/ExtensionSettingsFields.component";
import { InstalledTemplateCard } from "../../src/components/admin/extensions/InstalledTemplateCard.component";
import { useExtensionManager } from "../../src/components/admin/extensions/useExtensionManager.hook";
import { SystemAdminTemplateProvider } from "../../src/components/admin/system-shell/SystemAdminTemplateProvider.component";

const expiresAt = "2099-01-01T00:00:00.000Z";
const assignment: ExtensionAssignment = {
  selection: {
    templateId: controlPanelManifest.id,
    templateVersion: controlPanelManifest.version,
    target: "admin",
    paletteId: controlPanelManifest.palettes[0].id,
    paletteVersion: controlPanelManifest.palettes[0].version,
    mode: "light",
  },
  settings: {
    density: "comfortable",
    panelWidth: 280,
    layoutId: "without-topbar",
  },
  manifestHash: "b".repeat(64),
};
const entry: ExtensionCatalogEntryDto = {
  availability: "compiled",
  readiness: "preview-only",
  manifest: controlPanelManifest,
  settingsSchema,
  manifestHash: assignment.manifestHash,
};
const snapshot: ExtensionManagerSnapshotDto = {
  catalog: {
    schemaVersion: "1.0",
    catalogHash: "a".repeat(64),
    runtimeBuildId: "fixture-build",
    hostCompatibility: {
      contractVersion: "1.0",
      platformVersion: "1.0.0",
      reactVersion: "19.2.8",
      nextVersion: "16.3.1",
    },
    entries: [entry],
  },
  storage: "ready",
  targets: {
    admin: { revision: 4, current: null, previous: null },
    frontend: { revision: 0, current: null, previous: null },
  },
  history: [],
  permissions: { manageAppearance: true, installCode: false },
  codeInstallation: { ready: false, reason: "DELIVERY_ADAPTER_UNAVAILABLE" },
};
const plan: ExtensionAppearancePlanDto = {
  planId: "dac3107e-4c1f-45e2-9a04-1ca0c972433a",
  planHash: "c".repeat(64),
  target: "admin",
  action: "assign",
  expectedRevision: 4,
  catalogHash: snapshot.catalog.catalogHash,
  current: null,
  desiredAssignment: assignment,
  createdAt: "2026-11-12T00:00:00.000Z",
  expiresAt,
};
const managerProps: ExtensionManagerProps = {
  initialTheme: "light",
  themeCookieName: "fixture-mode",
  currentActor: { id: "actor-1", name: "Тестовый администратор" },
  appearance: {
    selection: { ...assignment.selection, target: "admin" },
    settings: assignment.settings,
    revision: 4,
    persisted: false,
    storageReady: true,
    requiresRecovery: false,
  },
};
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({
      media,
      matches: false,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Наследование enum настроек", () => {
  it("возвращает явный макет в наследование, сохраняя остальные параметры", () => {
    function Fields() {
      const [text, setText] = useState(JSON.stringify(assignment.settings));
      return h(
        "div",
        null,
        h(ExtensionSettingsFields, {
          schema: settingsSchema,
          text,
          disabled: false,
          onChange: setText,
        }),
        h("output", { "aria-label": "Настройки" }, text),
      );
    }
    render(h(Fields));
    const select = screen.getByRole<HTMLSelectElement>("combobox", {
      name: /^Макет/,
    });
    expect(select.value).toBe("without-topbar");
    expect(
      within(select).getByRole("option", { name: "По умолчанию" }),
    ).toBeTruthy();
    fireEvent.change(select, { target: { value: "" } });
    expect(
      JSON.parse(screen.getByLabelText("Настройки").textContent ?? ""),
    ).toEqual({ density: "comfortable", panelWidth: 280 });
    fireEvent.change(select, { target: { value: "default" } });
    expect(
      JSON.parse(screen.getByLabelText("Настройки").textContent ?? "").layoutId,
    ).toBe("default");
    fireEvent.change(select, { target: { value: "" } });
    expect(
      JSON.parse(screen.getByLabelText("Настройки").textContent ?? ""),
    ).not.toHaveProperty("layoutId");
  });

  it("не превращает required enum в пустую строку", () => {
    const change = vi.fn();
    render(
      h(ExtensionSettingsFields, {
        schema: {
          type: "object",
          properties: {
            channel: {
              type: "string",
              enum: ["stable", "beta"],
              title: "Канал",
            },
          },
          required: ["channel"],
        },
        text: '{"channel":"stable"}',
        disabled: false,
        onChange: change,
      }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Канал *" }), {
      target: { value: "" },
    });
    expect(change).not.toHaveBeenCalled();
  });
});

describe("Readiness в appearance UI", () => {
  it("позволяет подготовить preview-only настройки, объясняя ограничение", () => {
    const prepare = vi.fn();
    render(
      h(ExtensionAppearanceEditor, {
        entries: [entry],
        draft: {
          selection: assignment.selection,
          settingsText: JSON.stringify(assignment.settings),
        },
        active: null,
        revision: 4,
        disabled: false,
        canPrepare: true,
        onPrepare: prepare,
        onTemplateChange: vi.fn(),
        onPaletteChange: vi.fn(),
        onModeChange: vi.fn(),
        onSettingsChange: vi.fn(),
      }),
    );
    expect(
      screen.getByText(/Применение к рабочей панели пока недоступно/),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Подготовить изменение" }),
    );
    expect(prepare).toHaveBeenCalledOnce();
  });

  it("оставляет preview плана доступным, запрещает применение и сохраняет ready-поведение", () => {
    const apply = vi.fn();
    const props = {
      plan,
      disabled: false,
      invalidReason: null,
      onApply: apply,
      onDiscard: vi.fn(),
    };
    const view = render(
      h(ExtensionAppearancePlan, { ...props, readiness: "preview-only" }),
    );
    expect(
      screen.getByRole("link", { name: "Предпросмотр" }).getAttribute("href"),
    ).toContain(plan.planId);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Применить план" })
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Применить план" }));
    expect(apply).not.toHaveBeenCalled();
    view.rerender(h(ExtensionAppearancePlan, props));
    fireEvent.click(screen.getByRole("button", { name: "Применить план" }));
    expect(apply).toHaveBeenCalledOnce();
  });

  it("hook не отправляет apply preview-only плана даже при прямом вызове", async () => {
    const apply = vi.fn();
    const transport: ExtensionManagerTransport = {
      snapshot: vi.fn(async () => snapshot),
      prepare: vi.fn(async () => ({ plan, replayed: false })),
      apply,
    };
    const { result } = renderHook(() =>
      useExtensionManager(managerProps, transport),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.prepare();
    });
    expect(result.current.plan?.planId).toBe(plan.planId);
    expect(result.current.planReadiness).toBe("preview-only");
    await act(async () => {
      await result.current.apply();
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it("карточка показывает причину preview-only, сохраняя настройки доступными", () => {
    const card: InstalledTemplateEntryDto = {
      kind: "package",
      key: "package:fixture@0.1.0",
      id: "fixture",
      name: "Проверочный пакет",
      version: "0.1.0",
      packageName: "@fixture/template",
      targets: ["admin"],
      installation: "confirmed",
      availability: "available",
      readiness: "preview-only",
      usage: { selectedTargets: [], activeTargets: [], defaultTargets: [] },
      palettes: [],
      actions: { select: false, settings: true, reason: "preview_only" },
    };
    const settings = vi.fn();
    const view = render(
      h(InstalledTemplateCard, {
        entry: card,
        target: "admin",
        locked: false,
        onSelect: vi.fn(),
        onSettings: settings,
      }),
    );
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Выбрать шаблон" })
        .disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Настройки и палитра" }),
    );
    expect(settings).toHaveBeenCalledWith(card);
    expect(
      screen.getByText(/Применение к рабочей панели пока недоступно/),
    ).toBeTruthy();
    expect(screen.getByText("Для предпросмотра")).toBeTruthy();
    view.rerender(
      h(InstalledTemplateCard, {
        entry: {
          ...card,
          installation: "unverified",
          actions: {
            select: false,
            settings: false,
            reason: "runtime_unverified",
          },
        },
        target: "admin",
        locked: false,
        onSelect: vi.fn(),
        onSettings: settings,
      }),
    );
    expect(screen.getByText("Для предпросмотра")).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Настройки и палитра",
      }).disabled,
    ).toBe(true);
  });
});

describe("Защищённый candidate preview через реальный пакет", () => {
  it("показывает without-topbar, ссылку возврата и работающую локальную форму без built-in navigation", () => {
    const view = render(
      h(
        SystemAdminTemplateProvider,
        {
          selection: { ...assignment.selection, target: "admin" },
          settings: assignment.settings,
        },
        h(ExtensionAppearancePreview, {
          assignment,
          expiresAt,
          currentActor: managerProps.currentActor,
          readiness: "preview-only",
        }),
      ),
    );
    expect(
      view.container.querySelector(
        '[data-control-panel-layout="without-topbar"]',
      ),
    ).toBeTruthy();
    expect(
      view.container.querySelector('[data-panel-region="topbar"]'),
    ).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Вернуться к назначениям" })
        .getAttribute("href"),
    ).toBe("/system/appearance");
    fireEvent.change(screen.getByRole("textbox", { name: "Текст примера" }), {
      target: { value: "Проверка" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Проверить форму" }));
    expect(screen.getByText(/Локальная форма работает/)).toBeTruthy();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Тема предпросмотра" }),
      { target: { value: "dark" } },
    );
    expect(
      view.container
        .querySelector("[data-control-panel-layout]")
        ?.getAttribute("data-ui-theme"),
    ).toBe("dark");
  });

  it("при отсутствии readiness сохраняет полный legacy preview", () => {
    const legacy: ExtensionAssignment = {
      ...assignment,
      selection: {
        templateId: "realize",
        templateVersion: "0.1.0",
        target: "admin",
        paletteId: "realize",
        paletteVersion: "0.1.0",
        mode: "light",
      },
      settings: {},
    };
    render(
      h(
        SystemAdminTemplateProvider,
        { selection: { ...legacy.selection, target: "admin" }, settings: {} },
        h(ExtensionAppearancePreview, {
          assignment: legacy,
          expiresAt,
          currentActor: managerProps.currentActor,
        }),
      ),
    );
    expect(
      screen.getByRole("button", { name: "Вернуться к назначениям" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Профиль: Тестовый администратор" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("combobox", { name: "Тема предпросмотра" }),
    ).toBeNull();
  });
});
