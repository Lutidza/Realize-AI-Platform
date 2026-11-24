// @vitest-environment node
/**
 * @file tests/int/control-panel-catalog.int.spec.ts
 * @version 1.1.0
 * @date 2026-11-18
 * @description Проверяет реальную server registration Control Panel, настройки кандидата и запрет рабочего назначения.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createExtensionCatalog,
  resolveExtensionAssignment,
  createExtensionAppearanceStore,
  prepareExtensionAppearance,
  previewExtensionAppearance,
  applyExtensionAppearance,
} from "@realize/payload-extension-manager/server";
import { extensionTemplateCatalog } from "../../src/plugins/extensionTemplateCatalog.config";
import { adminAppearanceConfig } from "../../src/components/admin/system-shell/adminAppearance.config";

const selection = {
  templateId: "realizeai-control-panel",
  templateVersion: "0.1.0",
  target: "admin",
  paletteId: "realizeai-control-panel",
  paletteVersion: "0.1.0",
  mode: "light",
} as const;
const catalog = () =>
  createExtensionCatalog({
    entries: extensionTemplateCatalog,
    hostCompatibility: adminAppearanceConfig.host,
  });

describe("Control Panel в штатном каталоге host", () => {
  it("добавляет настоящий package без подмены legacy/default", () => {
    const current = catalog();
    expect(current.entries.map((entry) => entry.manifest.id)).toEqual([
      "realize",
      "realizeai-control-panel",
    ]);
    const entry = current.entries.find(
      (item) => item.manifest.id === selection.templateId,
    )!;
    expect(entry.readiness).toBe("preview-only");
    expect(entry.manifest.packageName).toBe(
      "@realize/template-realizeai-control-panel",
    );
    expect(entry.manifest.settings.schemaVersion).toBe("1.1.0");
    expect(adminAppearanceConfig.selection.templateId).toBe("realize");
  });

  it("валидирует оба макета и сохраняет различие наследования через public settings export", () => {
    const current = catalog();
    const resolve = (settings: Record<string, string | number>) =>
      resolveExtensionAssignment({
        catalog: current,
        target: "admin",
        selection,
        settings,
      }).settings;
    expect(resolve({})).not.toHaveProperty("layoutId");
    expect(resolve({ layoutId: "default" }).layoutId).toBe("default");
    expect(
      resolve({ layoutId: "without-topbar", panelWidth: 240 }).panelWidth,
    ).toBe(240);
    expect(() => resolve({ layoutId: "missing" })).toThrow();
    expect(() => resolve({ layoutId: "" })).toThrow();
    expect(() => resolve({ panelWidth: 500 })).toThrow();
  });

  it("готовит точный actor-bound preview, но не применяет каркас к рабочему Admin", () => {
    const current = catalog();
    const baseline = resolveExtensionAssignment({
      catalog: current,
      target: "admin",
      selection: adminAppearanceConfig.selection,
      settings: adminAppearanceConfig.settings,
    });
    const nowMs = Date.parse("2026-11-12T12:00:00.000Z");
    const prepared = prepareExtensionAppearance({
      // Только pure fixture: durable host остаётся с выключенной записью.
      layoutAssignmentWrites: "enabled",
      store: createExtensionAppearanceStore({ admin: baseline }),
      catalog: current,
      actorKey: "users:control-panel-catalog-fixture",
      requestId: randomUUID(),
      planId: randomUUID(),
      nowMs,
      input: {
        action: "assign",
        target: "admin",
        expectedRevision: 0,
        expectedCatalogHash: current.catalogHash,
        selection,
        settings: {
          layoutId: "without-topbar",
          density: "compact",
          panelWidth: 240,
        },
      },
    });
    const preview = previewExtensionAppearance({
      store: prepared.store,
      catalog: current,
      actorKey: "users:control-panel-catalog-fixture",
      planId: prepared.plan.planId,
      nowMs: nowMs + 1,
    });
    expect(preview.readiness).toBe("preview-only");
    expect(preview.desiredAssignment.settings).toEqual({
      layoutId: "without-topbar",
      density: "compact",
      panelWidth: 240,
    });
    expect(() =>
      applyExtensionAppearance({
        store: prepared.store,
        catalog: current,
        actorKey: "users:control-panel-catalog-fixture",
        requestId: randomUUID(),
        nowMs: nowMs + 2,
        input: {
          planId: prepared.plan.planId,
          expectedPlanHash: prepared.plan.planHash,
        },
      }),
    ).toThrow("TEMPLATE_PREVIEW_ONLY");
    expect(prepared.store.targets.admin.current).toEqual(baseline);
    expect(prepared.store.targets.admin.revision).toBe(0);
    expect(prepared.store.targets.frontend.current).toBeNull();
  });
});
