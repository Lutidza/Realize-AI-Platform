// @vitest-environment node
/**
 * @file tests/int/admin-appearance-fallback.int.spec.ts
 * @version 1.0.0
 * @date 2026-11-13
 * @description Проверяет readiness source fallback в конечном контексте Admin без повторного чтения БД.
 * @see documentation/architecture/system-admin-shell.md
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import manifest from "@realize/template-realize/manifest.json";
import schema from "@realize/template-realize/settings.schema.json";
import { resolveRealizeSettings } from "@realize/template-realize/settings";
import type { ExtensionCatalogRegistration } from "@realize/payload-extension-manager/contracts";
import { systemAdminReferenceAppearance } from "../../src/components/admin/system-shell/systemAdminReferenceAppearance.config";
import { resolveSystemAdminFallbackAppearance } from "../../src/components/admin/system-shell/resolveSystemAdminFallbackAppearance.validator";

const mocks = vi.hoisted(() => ({
  entries: [] as unknown[],
  config: {} as Record<string, unknown>,
  auth: vi.fn(),
  getPayload: vi.fn(),
  headers: vi.fn(),
  cookies: vi.fn(),
  runtimeAssignment: vi.fn(),
  shellRuntime: vi.fn(),
  redirect: vi.fn((url: string): never => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", () => ({ getPayload: mocks.getPayload }));
vi.mock("next/headers", () => ({
  headers: mocks.headers,
  cookies: mocks.cookies,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@realize/payload-extension-manager/server", () => ({
  readExtensionRuntimeAssignment: mocks.runtimeAssignment,
  readAdminShellRuntime: mocks.shellRuntime,
}));
vi.mock("../../src/plugins/extensionManager.config", () => ({
  extensionManagerOptions: { scopeKey: "fixture", userCollection: "users" },
}));
vi.mock("../../src/plugins/extensionTemplateCatalog.config", () => ({
  extensionTemplateCatalog: mocks.entries,
}));
vi.mock(
  "../../src/components/admin/system-shell/adminAppearance.config",
  () => ({ adminAppearanceConfig: mocks.config }),
);
import { requireSystemAdmin } from "../../src/components/admin/system-shell/requireSystemAdmin.service";

const host = {
  contractVersion: "1.0" as const,
  platformVersion: "1.0.0",
  reactVersion: "19.2.8",
  nextVersion: "16.3.1",
};
const source = {
  selection: {
    ...systemAdminReferenceAppearance.selection,
    templateId: "bootstrap",
  },
  settings: {},
};
const sourceValidator = vi.fn(resolveRealizeSettings);
const recoveryValidator = vi.fn(resolveRealizeSettings);
function entries(
  sourcePreview = true,
  recoveryPreview = false,
): ExtensionCatalogRegistration[] {
  return [
    {
      manifest: { ...manifest, id: "bootstrap" },
      settingsSchema: schema,
      resolveSettings: sourceValidator,
      ...(sourcePreview ? { readiness: "preview-only" as const } : {}),
    },
    {
      manifest,
      settingsSchema: schema,
      resolveSettings: recoveryValidator,
      ...(recoveryPreview ? { readiness: "preview-only" as const } : {}),
    },
  ];
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.entries.splice(0, mocks.entries.length, ...entries());
  Object.assign(mocks.config, source, { host });
  mocks.headers.mockResolvedValue(new Headers());
  mocks.cookies.mockResolvedValue({ get: () => undefined });
  mocks.auth.mockResolvedValue({
    user: {
      id: 17,
      collection: "users",
      roles: ["admin"],
      name: "Администратор",
    },
  });
  mocks.getPayload.mockResolvedValue({
    auth: mocks.auth,
    config: {
      routes: { admin: "/admin" },
      admin: { routes: { login: "/login", unauthorized: "/unauthorized" } },
      cookiePrefix: "payload",
    },
  });
  mocks.shellRuntime.mockResolvedValue({
    effectiveMode: "native",
    requiresRecovery: true,
    policy: {
      enabled: { native: true, template: true },
      nativeRoute: "/admin",
    },
  });
  mocks.runtimeAssignment.mockResolvedValue({
    assignment: null,
    revision: 6,
    persisted: true,
    storageReady: true,
    requiresRecovery: false,
  });
});

describe("Конечный host fallback оформления", () => {
  it("не возвращает preview-only default при null assignment и сохраняет management через проверенный recovery", async () => {
    const context = await requireSystemAdmin("/system/appearance");
    expect(context.appearance.selection).toEqual(
      systemAdminReferenceAppearance.selection,
    );
    expect(context.appearance.settings).toEqual(
      systemAdminReferenceAppearance.settings,
    );
    expect(context.appearance).toMatchObject({
      revision: 6,
      persisted: true,
      storageReady: true,
      requiresRecovery: true,
    });
    expect(sourceValidator).not.toHaveBeenCalled();
    expect(recoveryValidator).toHaveBeenCalledOnce();
    expect(mocks.runtimeAssignment).toHaveBeenCalledOnce();
    expect(mocks.shellRuntime).toHaveBeenCalledOnce();
    expect(mocks.getPayload).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("сохраняет рабочий source и нормализует его settings, если admission разрешён", async () => {
    mocks.entries.splice(0, mocks.entries.length, ...entries(false));
    mocks.config.settings = { density: "compact", panelWidth: 320 };
    const context = await requireSystemAdmin("/system/appearance");
    expect(context.appearance.selection).toEqual(source.selection);
    expect(context.appearance.settings).toEqual({
      density: "compact",
      panelWidth: 320,
    });
    expect(context.appearance.requiresRecovery).toBe(false);
    expect(sourceValidator).toHaveBeenCalledOnce();
    expect(recoveryValidator).not.toHaveBeenCalled();
  });

  it("отказывает закрыто, когда ни source, ни явно заданный recovery не допущены", async () => {
    mocks.entries.splice(0, mocks.entries.length, ...entries(true, true));
    await expect(requireSystemAdmin("/system/appearance")).rejects.toThrow(
      "ADMIN_APPEARANCE_UNAVAILABLE",
    );
    expect(sourceValidator).not.toHaveBeenCalled();
    expect(recoveryValidator).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("явный reference остаётся проверочным контекстом независимо от рабочей readiness и не читает назначения", async () => {
    mocks.entries.splice(0, mocks.entries.length, ...entries(true, true));
    const context = await requireSystemAdmin(
      "/system/appearance/preview/fixture",
      { appearance: "reference" },
    );
    expect(context.appearance.selection).toEqual(
      systemAdminReferenceAppearance.selection,
    );
    expect(context.appearance).toMatchObject({
      revision: 0,
      persisted: false,
      storageReady: false,
      requiresRecovery: false,
    });
    expect(context.initialTheme).toBe("dark");
    expect(mocks.runtimeAssignment).not.toHaveBeenCalled();
    expect(mocks.shellRuntime).not.toHaveBeenCalled();
  });

  it("не заменяет уже разрешённое runtime назначение source fallback", async () => {
    const selected = {
      selection: { ...systemAdminReferenceAppearance.selection, mode: "dark" },
      settings: { density: "compact", panelWidth: 300 },
      manifestHash: "a".repeat(64),
    };
    mocks.runtimeAssignment.mockResolvedValue({
      assignment: selected,
      revision: 7,
      persisted: true,
      storageReady: true,
      requiresRecovery: false,
    });
    const context = await requireSystemAdmin("/system/appearance");
    expect(context.appearance.selection).toEqual(selected.selection);
    expect(context.appearance.settings).toEqual(selected.settings);
    expect(sourceValidator).not.toHaveBeenCalled();
    expect(recoveryValidator).not.toHaveBeenCalled();
  });

  it("reference проверяет exact palette/settings и не выбирает другой ready пакет при ошибке", () => {
    expect(() =>
      resolveSystemAdminFallbackAppearance({
        entries: entries(false),
        host,
        source,
        recovery: {
          ...systemAdminReferenceAppearance,
          selection: {
            ...systemAdminReferenceAppearance.selection,
            paletteId: "missing",
          },
        },
        reference: true,
      }),
    ).toThrow("ADMIN_APPEARANCE_UNAVAILABLE");
    expect(() =>
      resolveSystemAdminFallbackAppearance({
        entries: entries(false),
        host,
        source,
        recovery: {
          ...systemAdminReferenceAppearance,
          settings: { unknown: true },
        },
        reference: true,
      }),
    ).toThrow("ADMIN_APPEARANCE_UNAVAILABLE");
  });
});
