// @vitest-environment node
/**
 * @file tests/int/installed-templates-host.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет production inventory service и HTTP с repository boundary mock без SQL или installed runtime claims.
 * @see documentation/specifications/extension-management.md
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PayloadRequest } from "payload";
import manifest from "@realize/template-realize/manifest.json";
import settingsSchema from "@realize/template-realize/settings.schema.json";
import { resolveRealizeSettings } from "@realize/template-realize/settings";
import type { ExtensionManagerOptions } from "../../packages/payload-extension-manager/src/ExtensionManagerOptions.types";
import {
  installedTemplatesSnapshotSchema,
  type AdminShellPolicy,
  type AdminShellStore,
  type ExtensionAppearanceStore,
  type InstalledTemplateRuntimeReceipt,
} from "../../packages/payload-extension-manager/src/extensionManagerContracts.index";
import { InstalledTemplatesService } from "../../packages/payload-extension-manager/src/server/InstalledTemplates.service";
import { createExtensionManagerEndpoints } from "../../packages/payload-extension-manager/src/server/extensionManagerEndpoints.controller";
import { resolveExtensionManagerOptions } from "../../packages/payload-extension-manager/src/extensionManagerOptions.config";
import { createExtensionRuntimeState } from "../../packages/payload-extension-manager/src/server/createExtensionRuntimeState.service";
import { createAdminShellStore } from "../../packages/payload-extension-manager/src/admin-shell/createAdminShellStore.util";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  mutate: vi.fn(),
  appearanceRead: vi.fn(),
  appearanceMutate: vi.fn(),
}));
/** Mock только repository boundary; production loader, SDK, fallback и HTTP выполняются буквально. */
vi.mock(
  "../../packages/payload-extension-manager/src/persistence/ExtensionState.repository",
  () => ({
    ExtensionStateRepository: class {
      read = mocks.read;
      mutate = mocks.mutate;
    },
  }),
);
vi.mock(
  "../../packages/payload-extension-manager/src/persistence/ExtensionAppearance.repository",
  () => ({
    ExtensionAppearanceRepository: class {
      read = mocks.appearanceRead;
      mutate = mocks.appearanceMutate;
    },
  }),
);

const BUILD_ID = "installed-host-build_1";
const BUILT_AT = "2026-10-12T10:00:00.000Z";
type FixtureUser = { id: number; collection: string; roles: string[] };
function fixture(apiRoute = "/realize-extensions") {
  const policy: AdminShellPolicy = {
    enabled: { native: true, template: true },
    defaultMode: "template",
    fallbackMode: "native",
    nativeVersion: "3.88.0",
    nativeRoute: "/admin",
    templateRoute: "/system",
  };
  let appearance: ExtensionAppearanceStore | null = null;
  let shell: AdminShellStore | null = null;
  let appearanceReady = true;
  let shellReady = true;
  let manageAppearance = true;
  const receipt: InstalledTemplateRuntimeReceipt = {
    schemaVersion: "1.0",
    buildId: BUILD_ID,
    sourceVersion: "1.0.0",
    builtAt: BUILT_AT,
  };
  const runtimeReader = vi.fn(async () => BUILD_ID as string | null);
  const receiptReader = vi.fn(
    async () => receipt as InstalledTemplateRuntimeReceipt | null,
  );
  const policyReader = vi.fn(async () => policy);
  const allowed = ({ req }: { req: PayloadRequest }) =>
    (req.user as unknown as FixtureUser | null)?.roles.includes("admin") ??
    false;
  const options: ExtensionManagerOptions = {
    userCollection: "users",
    scopeKey: "fixture:installed",
    apiRoute,
    catalog: [
      { manifest, settingsSchema, resolveSettings: resolveRealizeSettings },
    ],
    hostCompatibility: {
      contractVersion: "1.0",
      platformVersion: "1.0.0",
      reactVersion: "19.2.8",
      nextVersion: "16.3.1",
    },
    defaultAdmin: {
      selection: {
        templateId: "realize",
        templateVersion: "0.1.0",
        target: "admin",
        paletteId: "realize",
        paletteVersion: "0.1.0",
        mode: "light",
      },
      settings: {},
    },
    runtimeBuildId: runtimeReader,
    runtimeInstallation: receiptReader,
    adminShell: policyReader,
    access: {
      canReadCatalog: allowed,
      canManageAppearance: () => manageAppearance,
      canInstallCode: () => false,
    },
  };
  mocks.appearanceRead.mockImplementation(async () => ({
    store: appearance,
    storageReady: appearanceReady,
  }));
  mocks.read.mockImplementation(async () => ({
    store: shell,
    storageReady: shellReady,
  }));
  const resolved = resolveExtensionManagerOptions(options);
  const req = (
    user: FixtureUser | null = {
      id: 17,
      collection: "users",
      roles: ["admin"],
    },
    query = "",
  ) =>
    Object.assign(
      new Request(
        `http://localhost/api${apiRoute}/installed-templates${query}`,
      ),
      {
        payload: { config: { csrf: [], serverURL: "http://localhost" } },
        user,
      },
    ) as unknown as PayloadRequest;
  const call = (user?: FixtureUser | null, query = "") => {
    const endpoint = createExtensionManagerEndpoints(resolved).find(
      (candidate) =>
        candidate.path === `${apiRoute}/installed-templates` &&
        candidate.method === "get",
    );
    if (!endpoint) throw new Error("Missing inventory endpoint");
    return endpoint.handler(req(user, query));
  };
  return {
    options,
    resolved,
    policy,
    runtimeReader,
    receiptReader,
    policyReader,
    req,
    call,
    snapshot: () => new InstalledTemplatesService(req(), resolved).snapshot(),
    setAppearance: (value: ExtensionAppearanceStore | null) => {
      appearance = value;
    },
    setShell: (value: AdminShellStore | null) => {
      shell = value;
    },
    setStorage: (ready: boolean, shellStorage = ready) => {
      appearanceReady = ready;
      shellReady = shellStorage;
    },
    setPermission: (value: boolean) => {
      manageAppearance = value;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T11:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

describe("Installed templates production service/HTTP boundary", () => {
  it.each([
    ["anonymous", null, 401],
    ["wrong role", { id: 17, collection: "users", roles: ["customer"] }, 403],
    [
      "wrong auth owner",
      { id: 17, collection: "customers", roles: ["admin"] },
      403,
    ],
  ] as const)(
    "rejects %s before runtime/policy/SQL reads",
    async (_label, user, status) => {
      const current = fixture();
      const response = await current.call(user as FixtureUser | null);
      expect(response.status).toBe(status);
      expect((await response.json()).ok).toBe(false);
      expect(current.runtimeReader).not.toHaveBeenCalled();
      expect(current.receiptReader).not.toHaveBeenCalled();
      expect(current.policyReader).not.toHaveBeenCalled();
      expect(mocks.read).not.toHaveBeenCalled();
      expect(mocks.appearanceRead).not.toHaveBeenCalled();
      expect(mocks.mutate).not.toHaveBeenCalled();
      expect(mocks.appearanceMutate).not.toHaveBeenCalled();
    },
  );

  it("returns strict private/no-store inventory on a custom manager prefix without any mutation", async () => {
    const current = fixture("/extensions/custom");
    const response = await current.call();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.ok).toBe(true);
    expect(installedTemplatesSnapshotSchema.safeParse(body.data).success).toBe(
      true,
    );
    expect(body.data.runtime).toMatchObject({
      status: "verified",
      buildId: BUILD_ID,
    });
    expect(
      body.data.entries.map(
        (entry: { installation: string }) => entry.installation,
      ),
    ).toEqual(["confirmed", "confirmed"]);
    expect(mocks.appearanceRead).toHaveBeenCalledWith("fixture:installed");
    expect(mocks.read).toHaveBeenCalledWith("fixture:installed:admin-shell");
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.appearanceMutate).not.toHaveBeenCalled();
  });

  it("rejects unsupported query before runtime/storage and sanitizes repository exceptions", async () => {
    const current = fixture();
    const queryResponse = await current.call(
      undefined,
      "?actorKey=another-user",
    );
    expect(queryResponse.status).toBe(400);
    expect(mocks.appearanceRead).not.toHaveBeenCalled();
    expect(current.runtimeReader).not.toHaveBeenCalled();
    mocks.appearanceRead.mockRejectedValue(
      new Error("postgres://private-credential row actorKey=users:secret"),
    );
    const response = await current.call();
    const text = await response.text();
    expect(response.status).toBe(503);
    for (const hidden of [
      "private-credential",
      "postgres://",
      "users:secret",
      "actorKey",
    ])
      expect(text).not.toContain(hidden);
    expect(JSON.parse(text)).toMatchObject({
      ok: false,
      error: { code: "STORAGE_UNAVAILABLE" },
    });
  });

  it("keeps bundled inventory unverified when the host supplies no runtime-installation callback", async () => {
    const current = fixture();
    delete current.resolved.runtimeInstallation;
    const snapshot = await current.snapshot();
    expect(snapshot.runtime).toEqual({
      status: "unverified",
      buildId: null,
      sourceVersion: null,
      builtAt: null,
    });
    expect(snapshot.entries[1].usage.activeTargets).toEqual(["admin"]);
    expect(snapshot.entries[1].actions).toEqual({
      settings: false,
      select: false,
      reason: "runtime_unverified",
    });
    expect(current.receiptReader).not.toHaveBeenCalled();
    expect(mocks.appearanceMutate).not.toHaveBeenCalled();
  });

  it.each(["mismatched", "missing"])(
    "requires receipt to match the %s catalog runtime build identity",
    async (kind) => {
      const current = fixture();
      current.runtimeReader.mockResolvedValue(
        kind === "missing" ? null : "other-build",
      );
      const snapshot = await current.snapshot();
      expect(snapshot.runtime.status).toBe("unverified");
      expect(
        snapshot.entries.every((entry) => entry.installation === "unverified"),
      ).toBe(true);
      expect(
        snapshot.entries.every(
          (entry) => !entry.actions.settings && !entry.actions.select,
        ),
      ).toBe(true);
    },
  );

  it("refuses an accessor receipt in the server facade without executing getters", async () => {
    const current = fixture();
    let calls = 0;
    const accessor = Object.defineProperty({}, "buildId", {
      enumerable: true,
      get() {
        calls += 1;
        throw new Error("private-token");
      },
    });
    current.receiptReader.mockResolvedValue(
      accessor as InstalledTemplateRuntimeReceipt,
    );
    const response = await current.call();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(calls).toBe(0);
    expect(body.data.runtime.status).toBe("unverified");
    expect(JSON.stringify(body)).not.toContain("private-token");
    expect(mocks.appearanceMutate).not.toHaveBeenCalled();
  });

  it.each(["appearance", "shell"])(
    "disables actions when the %s storage schema is absent without hiding inventory",
    async (domain) => {
      const current = fixture();
      current.setStorage(domain !== "appearance", domain !== "shell");
      const snapshot = await current.snapshot();
      expect(snapshot.storage).toBe("requires_schema");
      expect(snapshot.entries).toHaveLength(2);
      expect(
        snapshot.entries.every(
          (entry) =>
            entry.actions.reason === "requires_schema" &&
            !entry.actions.select &&
            !entry.actions.settings,
        ),
      ).toBe(true);
      expect(mocks.mutate).not.toHaveBeenCalled();
      expect(mocks.appearanceMutate).not.toHaveBeenCalled();
    },
  );

  it("returns readable inventory with read-only actions when appearance management is denied", async () => {
    const current = fixture();
    current.setPermission(false);
    const snapshot = await current.snapshot();
    expect(snapshot.permissions.manageAppearance).toBe(false);
    expect(
      snapshot.entries.every((entry) => entry.actions.reason === "read_only"),
    ).toBe(true);
  });

  it("distinguishes saved native selection from bundled template defaults while preserving package settings", async () => {
    const current = fixture();
    const runtime = await createExtensionRuntimeState(current.resolved);
    const shell = createAdminShellStore(current.policy);
    shell.state.current = "native";
    current.setShell(shell);
    current.setAppearance(runtime.bootstrapStore);
    const before = JSON.stringify(runtime.bootstrapStore);
    const snapshot = await current.snapshot();
    expect(snapshot.entries[0].usage).toEqual({
      selectedTargets: ["admin"],
      activeTargets: ["admin"],
      defaultTargets: [],
    });
    expect(snapshot.entries[1].usage).toEqual({
      selectedTargets: ["admin"],
      activeTargets: [],
      defaultTargets: ["admin"],
    });
    expect(snapshot.entries[1].actions.settings).toBe(true);
    expect(JSON.stringify(runtime.bootstrapStore)).toBe(before);
    expect(mocks.appearanceMutate).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("shows effective native fallback for an old saved package pointer without rewriting it as default", async () => {
    const current = fixture();
    const runtime = await createExtensionRuntimeState(current.resolved);
    const invalid = runtime.bootstrapStore;
    invalid.targets.admin.current!.selection.templateVersion = "0.0.9";
    current.setAppearance(invalid);
    current.setShell(createAdminShellStore(current.policy));
    const before = JSON.stringify(invalid);
    const snapshot = await current.snapshot();
    expect(snapshot.entries[0].usage).toEqual({
      selectedTargets: [],
      activeTargets: ["admin"],
      defaultTargets: [],
    });
    expect(snapshot.entries[1].usage).toEqual({
      selectedTargets: [],
      activeTargets: [],
      defaultTargets: ["admin"],
    });
    expect(snapshot.unavailableAssignments).toEqual([
      {
        target: "admin",
        templateId: "realize",
        templateVersion: "0.0.9",
        reason: "not_compiled",
      },
    ]);
    expect(JSON.stringify(invalid)).toBe(before);
    expect(mocks.appearanceMutate).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it.each(["hash", "settings"])(
    "uses the shared runtime fallback for saved %s drift and excludes private state from DTO",
    async (kind) => {
      const current = fixture();
      const runtime = await createExtensionRuntimeState(current.resolved);
      const invalid = runtime.bootstrapStore;
      if (kind === "hash")
        invalid.targets.admin.current!.manifestHash = "f".repeat(64);
      else invalid.targets.admin.current!.settings = { panelWidth: 280 };
      Object.assign(invalid, {
        privateCredential: "hidden-password",
        actorKey: "users:secret",
      });
      current.setAppearance(invalid);
      current.setShell(createAdminShellStore(current.policy));
      const before = JSON.stringify(invalid);
      const snapshot = await current.snapshot();
      expect(snapshot.unavailableAssignments[0].reason).toBe(
        "invalid_assignment",
      );
      expect(snapshot.entries[0].usage.activeTargets).toEqual(["admin"]);
      expect(snapshot.entries[1].actions.settings).toBe(false);
      const encoded = JSON.stringify(snapshot);
      for (const hidden of [
        "hidden-password",
        "users:secret",
        "manifestHash",
        "settingsSchema",
        "actorKey",
        "requestId",
      ])
        expect(encoded).not.toContain(hidden);
      expect(JSON.stringify(invalid)).toBe(before);
      expect(mocks.appearanceMutate).not.toHaveBeenCalled();
      expect(mocks.mutate).not.toHaveBeenCalled();
    },
  );
});
