/**
 * @file tests/int/system-admin-shell.int.spec.ts
 * @version 1.4.0
 * @date 2026-10-12
 * @description Проверяет отказ в доступе и безопасный контекст самостоятельной системной админки.
 * @see documentation/architecture/system-admin-shell.md
 */

// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getPayload: vi.fn(),
  headers: vi.fn(),
  cookies: vi.fn(),
  cookieGet: vi.fn(),
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
vi.mock("@/plugins/extensionManager.config", () => ({
  extensionManagerOptions: {
    userCollection: "users",
    scopeKey: "fixture:appearance",
  },
}));

import { requireSystemAdmin } from "../../src/components/admin/system-shell/requireSystemAdmin.service";
import { SYSTEM_TASK_MANAGER_REFERENCE_ROUTE } from "../../src/components/admin/system-shell/systemAdmin.routes";
import { systemAdminReferenceAppearance } from "../../src/components/admin/system-shell/systemAdminReferenceAppearance.config";

/** Runtime adapter mock проверяет SSR boundary, а не SQL/readiness установленного приложения. */
const appearance = {
  selection: {
    templateId: "realize",
    templateVersion: "0.1.0",
    target: "admin",
    paletteId: "realize",
    paletteVersion: "0.1.0",
    mode: "dark",
  },
  settings: { density: "compact", panelWidth: 320 },
  revision: 4,
  persisted: true,
  storageReady: true,
  requiresRecovery: false,
};

describe("Проверка доступа системной админки", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: null });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.cookies.mockResolvedValue({ get: mocks.cookieGet });
    mocks.shellRuntime.mockResolvedValue({
      effectiveMode: "template",
      requiresRecovery: false,
      policy: {
        enabled: { native: true, template: true },
        nativeRoute: "/admin",
      },
    });
    mocks.runtimeAssignment.mockResolvedValue({
      assignment: {
        selection: appearance.selection,
        settings: appearance.settings,
        manifestHash: "a".repeat(64),
      },
      revision: appearance.revision,
      persisted: appearance.persisted,
      storageReady: appearance.storageReady,
      requiresRecovery: appearance.requiresRecovery,
    });
    mocks.getPayload.mockResolvedValue({
      auth: mocks.auth,
      config: {
        routes: { admin: "/admin" },
        admin: { routes: { login: "/login", unauthorized: "/unauthorized" } },
        cookiePrefix: "payload",
      },
    });
  });

  it("направляет анонимного пользователя на штатный вход с внутренним адресом возврата", async () => {
    await expect(
      requireSystemAdmin(SYSTEM_TASK_MANAGER_REFERENCE_ROUTE),
    ).rejects.toThrow(
      `redirect:/admin/login?redirect=${encodeURIComponent(SYSTEM_TASK_MANAGER_REFERENCE_ROUTE)}`,
    );
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.runtimeAssignment).not.toHaveBeenCalled();
  });

  it.each([
    { collection: "users", roles: ["customer"] },
    { collection: "users", roles: [] },
    { collection: "other", roles: ["admin"] },
  ])("не пропускает неподходящего пользователя: %j", async (user) => {
    mocks.auth.mockResolvedValue({ user });
    await expect(
      requireSystemAdmin(SYSTEM_TASK_MANAGER_REFERENCE_ROUTE),
    ).rejects.toThrow("redirect:/admin/unauthorized");
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.runtimeAssignment).not.toHaveBeenCalled();
  });

  it("передаёт клиенту безопасного участника и тему после проверки текущих заголовков", async () => {
    const requestHeaders = new Headers({ "x-test-request": "system-admin" });
    mocks.headers.mockResolvedValue(requestHeaders);
    mocks.auth.mockResolvedValue({
      user: {
        id: 1,
        name: "Участник",
        collection: "users",
        roles: ["admin"],
        email: "fixture@example.test",
      },
      token: "test-placeholder",
    });
    mocks.cookieGet.mockReturnValue({ value: "light" });
    const result = await requireSystemAdmin(
      SYSTEM_TASK_MANAGER_REFERENCE_ROUTE,
    );
    expect(result).toStrictEqual({
      initialTheme: "light",
      themeCookieName: "payload-theme",
      currentActor: { id: "1", name: "Участник" },
      adminShell: {
        mode: "template",
        nativeEnabled: true,
        requiresRecovery: false,
      },
      appearance,
    });
    expect(mocks.auth).toHaveBeenCalledWith({ headers: requestHeaders });
    expect(mocks.cookieGet).toHaveBeenCalledWith("payload-theme");
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.runtimeAssignment).toHaveBeenCalledWith(
      await mocks.getPayload.mock.results[0].value,
      { userCollection: "users", scopeKey: "fixture:appearance" },
      "admin",
    );
  });

  it("повторно проверяет роль при следующем обращении", async () => {
    mocks.auth.mockResolvedValueOnce({
      user: { id: 1, collection: "users", roles: ["admin"] },
    });
    expect(
      await requireSystemAdmin(SYSTEM_TASK_MANAGER_REFERENCE_ROUTE),
    ).toStrictEqual({
      initialTheme: "dark",
      themeCookieName: "payload-theme",
      currentActor: { id: "1", name: "Администратор" },
      adminShell: {
        mode: "template",
        nativeEnabled: true,
        requiresRecovery: false,
      },
      appearance,
    });
    mocks.auth.mockResolvedValueOnce({
      user: { collection: "users", roles: ["customer"] },
    });
    await expect(
      requireSystemAdmin(SYSTEM_TASK_MANAGER_REFERENCE_ROUTE),
    ).rejects.toThrow("redirect:/admin/unauthorized");
    expect(mocks.auth).toHaveBeenCalledTimes(2);
    expect(mocks.runtimeAssignment).toHaveBeenCalledTimes(1);
  });

  it("передаёт имя theme cookie из конфигурации host", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: 1, collection: "users", roles: ["admin"] },
    });
    mocks.getPayload.mockResolvedValue({
      auth: mocks.auth,
      config: {
        routes: { admin: "/admin" },
        admin: { routes: { login: "/login", unauthorized: "/unauthorized" } },
        cookiePrefix: "customer-admin",
      },
    });
    const context = await requireSystemAdmin(
      SYSTEM_TASK_MANAGER_REFERENCE_ROUTE,
    );
    expect(context.themeCookieName).toBe("customer-admin-theme");
    expect(mocks.cookieGet).toHaveBeenCalledWith("customer-admin-theme");
  });

  it("не открывает UI при ошибке проверки сессии", async () => {
    mocks.auth.mockRejectedValueOnce(new Error("Auth unavailable"));
    await expect(
      requireSystemAdmin(SYSTEM_TASK_MANAGER_REFERENCE_ROUTE),
    ).rejects.toThrow("Auth unavailable");
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.runtimeAssignment).not.toHaveBeenCalled();
  });

  it("использует настройки host для адреса входа", async () => {
    mocks.getPayload.mockResolvedValueOnce({
      auth: mocks.auth,
      config: {
        routes: { admin: "/cms" },
        admin: { routes: { login: "/sign-in", unauthorized: "/forbidden" } },
        cookiePrefix: "realize",
      },
    });
    await expect(
      requireSystemAdmin(SYSTEM_TASK_MANAGER_REFERENCE_ROUTE),
    ).rejects.toThrow(
      `redirect:/cms/sign-in?redirect=${encodeURIComponent(SYSTEM_TASK_MANAGER_REFERENCE_ROUTE)}`,
    );
  });

  it.each([
    [undefined, "light"],
    ["invalid", "light"],
    ["dark", "dark"],
    ["light", "light"],
  ])(
    "предпочитает валидный cookie сохранённому mode, иначе использует selection.mode: %s",
    async (cookie, expected) => {
      mocks.auth.mockResolvedValue({
        user: { id: 1, collection: "users", roles: ["admin"] },
      });
      mocks.runtimeAssignment.mockResolvedValue({
        assignment: {
          selection: { ...appearance.selection, mode: "light" },
          settings: appearance.settings,
          manifestHash: "a".repeat(64),
        },
        revision: appearance.revision,
        persisted: true,
        storageReady: true,
        requiresRecovery: false,
      });
      mocks.cookieGet.mockReturnValue(
        cookie === undefined ? undefined : { value: cookie },
      );
      const context = await requireSystemAdmin("/system/task-manager");
      expect(context.initialTheme).toBe(expected);
      expect(context.appearance.selection.mode).toBe("light");
      expect(context.appearance.settings).toEqual(appearance.settings);
    },
  );

  it("фиксирует reference preset и не читает рабочее назначение даже при storage error", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: 1, collection: "users", roles: ["admin"] },
    });
    mocks.runtimeAssignment.mockRejectedValue(
      new Error("must not read appearance"),
    );
    const context = await requireSystemAdmin(
      SYSTEM_TASK_MANAGER_REFERENCE_ROUTE,
      { appearance: "reference" },
    );
    expect(context.appearance).toEqual({
      ...systemAdminReferenceAppearance,
      revision: 0,
      persisted: false,
      storageReady: false,
      requiresRecovery: false,
    });
    expect(context.initialTheme).toBe("dark");
    expect(mocks.runtimeAssignment).not.toHaveBeenCalled();
    expect(mocks.shellRuntime).not.toHaveBeenCalled();
  });
});
