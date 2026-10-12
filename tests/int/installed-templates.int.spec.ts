// @vitest-environment node
/**
 * @file tests/int/installed-templates.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет runtime inventory, независимые selection/activity/defaults и безопасный public DTO без I/O claims.
 * @see documentation/specifications/extension-management.md
 */
import { describe, expect, it } from "vitest";
import manifest from "@realize/template-realize/manifest.json";
import settingsSchema from "@realize/template-realize/settings.schema.json";
import { resolveRealizeSettings } from "@realize/template-realize/settings";
import {
  installedTemplateEntrySchema,
  installedTemplateRuntimeReceiptSchema,
  installedTemplatesSnapshotSchema,
  mapInstalledTemplatesSnapshot,
  type ExtensionAssignment,
  type ExtensionCatalog,
  type InstalledTemplatesLoaderContext,
} from "../../packages/payload-extension-manager/src/extensionManagerContracts.index";
import { createExtensionCatalog } from "../../packages/payload-extension-manager/src/catalog/createExtensionCatalog.service";
import { resolveExtensionAssignment } from "../../packages/payload-extension-manager/src/catalog/resolveExtensionAssignment.validator";
import { createExtensionAppearanceStore } from "../../packages/payload-extension-manager/src/appearance/createExtensionAppearanceStore.util";

const BUILD_ID = "installed-test-build_1";
const BUILT_AT = "2026-10-12T10:00:00.000Z";
const OBSERVED_AT = "2026-10-12T11:00:00.000Z";
function catalog(
  manifests: readonly unknown[] = [manifest],
  platformVersion = "1.0.0",
) {
  return createExtensionCatalog({
    entries: manifests.map((current) => ({
      manifest: current,
      settingsSchema,
      resolveSettings: resolveRealizeSettings,
    })),
    hostCompatibility: {
      contractVersion: "1.0",
      platformVersion,
      reactVersion: "19.2.8",
      nextVersion: "16.3.1",
    },
    runtimeBuildId: BUILD_ID,
  });
}
function assignment(
  current: ExtensionCatalog,
  version = "0.1.0",
  target: "admin" | "frontend" = "admin",
): ExtensionAssignment {
  return resolveExtensionAssignment({
    catalog: current,
    target,
    selection: {
      templateId: "realize",
      templateVersion: version,
      target,
      paletteId: "realize",
      paletteVersion: "0.1.0",
      mode: "light",
    },
    settings: { density: "comfortable", panelWidth: 280 },
  });
}
function context(current = catalog()): InstalledTemplatesLoaderContext {
  const admin = assignment(current);
  return {
    catalog: current,
    store: createExtensionAppearanceStore({ admin }),
    bootstrapStore: createExtensionAppearanceStore({ admin }),
    policy: {
      enabled: { native: true, template: true },
      defaultMode: "template",
      fallbackMode: "native",
      nativeVersion: "3.88.0",
      nativeRoute: "/admin",
      templateRoute: "/system",
    },
    selectedShellMode: "template",
    shellMode: "template",
    assignmentByTarget: { admin, frontend: null },
    requiresRecovery: [],
    runtime: {
      schemaVersion: "1.0",
      buildId: BUILD_ID,
      sourceVersion: "1.0.0",
      builtAt: BUILT_AT,
      catalogHash: current.catalogHash,
    },
    storageReady: true,
    manageAppearance: true,
    observedAt: OBSERVED_AT,
  };
}
function packages(input: InstalledTemplatesLoaderContext) {
  return mapInstalledTemplatesSnapshot(input).entries.filter(
    (entry) => entry.kind === "package",
  );
}

describe("Installed templates runtime inventory", () => {
  it("confirms same-build/same-catalog inventory and keeps native vendor metadata outside the template SDK", () => {
    const snapshot = mapInstalledTemplatesSnapshot(context());
    expect(snapshot.runtime).toEqual({
      status: "verified",
      buildId: BUILD_ID,
      sourceVersion: "1.0.0",
      builtAt: BUILT_AT,
    });
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.entries[0]).toMatchObject({
      kind: "builtin",
      key: "builtin:payload-native@3.88.0",
      id: "payload-native",
      name: "Payload Admin",
      version: "3.88.0",
      packageName: null,
      targets: ["admin"],
      installation: "confirmed",
      palettes: [],
      actions: { settings: false, select: true, reason: null },
      usage: { selectedTargets: [], activeTargets: [], defaultTargets: [] },
    });
    expect(snapshot.entries[1]).toMatchObject({
      kind: "package",
      packageName: "@realize/template-realize",
      version: "0.1.0",
      installation: "confirmed",
      availability: "available",
      usage: {
        selectedTargets: ["admin"],
        activeTargets: ["admin"],
        defaultTargets: ["admin"],
      },
      actions: { settings: true, select: true, reason: null },
    });
    expect(snapshot.unavailableAssignments).toEqual([]);
  });

  it.each([
    ["no evidence", null],
    [
      "source metadata only",
      { packageName: "@realize/template-realize", version: "0.1.0" },
    ],
    [
      "wrong build",
      {
        schemaVersion: "1.0",
        buildId: "another-build",
        sourceVersion: "1.0.0",
        builtAt: BUILT_AT,
      },
    ],
    [
      "future receipt",
      {
        schemaVersion: "1.0",
        buildId: BUILD_ID,
        sourceVersion: "1.0.0",
        builtAt: "2026-10-13T00:00:00.000Z",
      },
    ],
    [
      "malformed time",
      {
        schemaVersion: "1.0",
        buildId: BUILD_ID,
        sourceVersion: "1.0.0",
        builtAt: "yesterday",
      },
    ],
    [
      "wrong protocol",
      {
        schemaVersion: "2.0",
        buildId: BUILD_ID,
        sourceVersion: "1.0.0",
        builtAt: BUILT_AT,
      },
    ],
  ])("does not turn %s into confirmed installation", (_label, runtime) => {
    const input = context();
    input.runtime =
      runtime === null
        ? null
        : { ...runtime, catalogHash: input.catalog.catalogHash };
    const snapshot = mapInstalledTemplatesSnapshot(input);
    expect(snapshot.runtime).toEqual({
      status: "unverified",
      buildId: null,
      sourceVersion: null,
      builtAt: null,
    });
    for (const entry of snapshot.entries)
      expect(entry).toMatchObject({
        installation: "unverified",
        actions: {
          settings: false,
          select: false,
          reason: "runtime_unverified",
        },
      });
  });

  it("rejects a valid receipt bound to different catalog content, including the same package identity with changed host compatibility", () => {
    const input = context();
    input.runtime = {
      schemaVersion: "1.0",
      buildId: BUILD_ID,
      sourceVersion: "1.0.0",
      builtAt: BUILT_AT,
      catalogHash: "a".repeat(64),
    };
    expect(mapInstalledTemplatesSnapshot(input).runtime.status).toBe(
      "unverified",
    );
    input.catalog = catalog([manifest], "1.1.0");
    input.runtime = {
      schemaVersion: "1.0",
      buildId: BUILD_ID,
      sourceVersion: "1.0.0",
      builtAt: BUILT_AT,
      catalogHash: catalog().catalogHash,
    };
    expect(mapInstalledTemplatesSnapshot(input).runtime.status).toBe(
      "unverified",
    );
  });

  it("rejects an accessor receipt without executing it or exposing extra private evidence fields", () => {
    let calls = 0;
    const input = context();
    input.runtime = Object.defineProperty({}, "buildId", {
      enumerable: true,
      get() {
        calls += 1;
        throw new Error("private credential");
      },
    });
    const snapshot = mapInstalledTemplatesSnapshot(input);
    expect(calls).toBe(0);
    expect(snapshot.runtime.status).toBe("unverified");
    expect(JSON.stringify(snapshot)).not.toContain("private credential");
    expect(
      installedTemplateRuntimeReceiptSchema.safeParse({
        schemaVersion: "1.0",
        buildId: BUILD_ID,
        sourceVersion: "1.0.0",
        builtAt: BUILT_AT,
        actorKey: "users:private",
      }).success,
    ).toBe(false);
  });

  it("does not invent a native entry when the host supplies no native policy", () => {
    const input = context();
    input.policy = null;
    expect(
      mapInstalledTemplatesSnapshot(input).entries.map((entry) => entry.kind),
    ).toEqual(["package"]);
  });
});

describe("Installed templates selection, activity and defaults", () => {
  it("retains selected package/settings while native is selected and active", () => {
    const input = context();
    input.selectedShellMode = "native";
    input.shellMode = "native";
    const before = JSON.stringify(input.store);
    const snapshot = mapInstalledTemplatesSnapshot(input);
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
    expect(JSON.stringify(input.store)).toBe(before);
  });

  it("shows effective native fallback independently from a saved template shell selection", () => {
    const input = context();
    input.shellMode = "native";
    const snapshot = mapInstalledTemplatesSnapshot(input);
    expect(snapshot.entries[0].usage.selectedTargets).toEqual([]);
    expect(snapshot.entries[0].usage.activeTargets).toEqual(["admin"]);
    expect(snapshot.entries[1].usage.selectedTargets).toEqual(["admin"]);
    expect(snapshot.entries[1].usage.activeTargets).toEqual([]);
  });

  it("keeps exact selected/active version apart from a different bundled default and protects source from DTO mutation", () => {
    const current = catalog([manifest, { ...manifest, version: "0.2.0" }]);
    const input = context(current);
    const selected = assignment(current, "0.2.0");
    input.store.targets.admin.current = selected;
    input.assignmentByTarget.admin = selected;
    const entries = packages(input);
    expect(entries[0].usage).toEqual({
      selectedTargets: [],
      activeTargets: [],
      defaultTargets: ["admin"],
    });
    expect(entries[0].actions).toEqual({
      settings: true,
      select: true,
      reason: null,
    });
    expect(entries[1].usage).toEqual({
      selectedTargets: ["admin"],
      activeTargets: ["admin"],
      defaultTargets: [],
    });
    entries[0].palettes[0].modes.length = 0;
    expect(current.entries[0].manifest.palettes[0].modes).toEqual([
      "light",
      "dark",
    ]);
  });

  it("supports independent frontend activity while native Admin is active without inventing frontend defaults", () => {
    const dual = {
      ...manifest,
      entries: { admin: "./admin", frontend: "./frontend" },
      targets: [...manifest.targets, { target: "frontend", screens: ["page"] }],
    };
    const current = catalog([dual]);
    const input = context(current);
    const frontend = assignment(current, "0.1.0", "frontend");
    input.store.targets.frontend.current = frontend;
    input.assignmentByTarget.frontend = frontend;
    input.selectedShellMode = "native";
    input.shellMode = "native";
    expect(packages(input)[0].usage).toEqual({
      selectedTargets: ["admin", "frontend"],
      activeTargets: ["frontend"],
      defaultTargets: ["admin"],
    });
  });

  it("reports missing saved versions without relabelling them as installed or replacing them with current default", () => {
    const input = context();
    input.store.targets.admin.current = {
      ...input.store.targets.admin.current!,
      selection: {
        ...input.store.targets.admin.current!.selection,
        templateVersion: "0.0.9",
      },
    };
    input.requiresRecovery = ["admin"];
    const before = JSON.stringify(input.store);
    const snapshot = mapInstalledTemplatesSnapshot(input);
    expect(snapshot.entries[1].usage).toEqual({
      selectedTargets: [],
      activeTargets: ["admin"],
      defaultTargets: ["admin"],
    });
    expect(snapshot.entries.some((entry) => entry.version === "0.0.9")).toBe(
      false,
    );
    expect(snapshot.unavailableAssignments).toEqual([
      {
        target: "admin",
        templateId: "realize",
        templateVersion: "0.0.9",
        reason: "not_compiled",
      },
    ]);
    expect(JSON.stringify(input.store)).toBe(before);
  });

  it("reports incompatible saved assignments and disables activity/selection through the existing SDK compatibility checks", () => {
    const input = context();
    input.catalog = catalog([manifest], "2.0.0");
    input.runtime = {
      schemaVersion: "1.0",
      buildId: BUILD_ID,
      sourceVersion: "1.0.0",
      builtAt: BUILT_AT,
      catalogHash: input.catalog.catalogHash,
    };
    const snapshot = mapInstalledTemplatesSnapshot(input);
    expect(snapshot.entries[1]).toMatchObject({
      availability: "incompatible",
      usage: { selectedTargets: ["admin"], activeTargets: [] },
      actions: { settings: false, select: false, reason: "unavailable" },
    });
    expect(snapshot.unavailableAssignments[0].reason).toBe("incompatible");
  });

  it.each(["manifestHash", "normalization"])(
    "refuses %s drift as activation proof while leaving saved input unchanged",
    (kind) => {
      const input = context();
      const saved = input.store.targets.admin.current!;
      const invalid =
        kind === "manifestHash"
          ? { ...saved, manifestHash: "f".repeat(64) }
          : { ...saved, settings: { panelWidth: 280 } };
      input.store.targets.admin.current = invalid;
      input.assignmentByTarget.admin = invalid;
      const before = JSON.stringify(input.store);
      const snapshot = mapInstalledTemplatesSnapshot(input);
      expect(snapshot.entries[1].usage.activeTargets).toEqual([]);
      expect(snapshot.entries[1].usage.selectedTargets).toEqual(["admin"]);
      expect(snapshot.entries[1].actions.settings).toBe(false);
      expect(snapshot.unavailableAssignments[0].reason).toBe(
        "invalid_assignment",
      );
      expect(JSON.stringify(input.store)).toBe(before);
    },
  );

  it("keeps an invalid saved selection separate from a valid normalized effective fallback", () => {
    const input = context();
    const current = input.store.targets.admin.current!;
    input.store.targets.admin.current = {
      ...current,
      manifestHash: "0".repeat(64),
    };
    input.requiresRecovery = ["admin"];
    const snapshot = mapInstalledTemplatesSnapshot(input);
    expect(snapshot.entries[1].usage.activeTargets).toEqual(["admin"]);
    expect(snapshot.entries[1].actions.settings).toBe(false);
    expect(snapshot.unavailableAssignments[0].reason).toBe(
      "invalid_assignment",
    );
  });

  it("exposes disabled native UI without changing backend/package state", () => {
    const input = context();
    input.policy!.enabled.native = false;
    input.policy!.fallbackMode = "template";
    const snapshot = mapInstalledTemplatesSnapshot(input);
    expect(snapshot.entries[0]).toMatchObject({
      availability: "disabled",
      usage: { activeTargets: [] },
      actions: { settings: false, select: false, reason: "unavailable" },
    });
    expect(snapshot.entries[1].usage.activeTargets).toEqual(["admin"]);
  });

  it("exposes disabled template UI while preserving its saved assignment", () => {
    const input = context();
    input.policy!.enabled.template = false;
    input.policy!.defaultMode = "native";
    input.shellMode = "native";
    const snapshot = mapInstalledTemplatesSnapshot(input);
    expect(snapshot.entries[1]).toMatchObject({
      availability: "disabled",
      usage: { selectedTargets: ["admin"], activeTargets: [] },
      actions: { settings: false, select: false, reason: "unavailable" },
    });
    expect(snapshot.entries[0].usage).toEqual({
      selectedTargets: [],
      activeTargets: ["admin"],
      defaultTargets: ["admin"],
    });
  });
});

describe("Installed templates DTO and action permissions", () => {
  it.each([
    ["read_only", false, true, true],
    ["requires_schema", true, false, true],
    ["runtime_unverified", true, true, false],
  ] as const)(
    "disables actions with %s while preserving inventory",
    (reason, manageAppearance, storageReady, verified) => {
      const input = context();
      input.manageAppearance = manageAppearance;
      input.storageReady = storageReady;
      if (!verified) input.runtime = null;
      const snapshot = mapInstalledTemplatesSnapshot(input);
      expect(snapshot.entries).toHaveLength(2);
      for (const entry of snapshot.entries)
        expect(entry.actions).toEqual({
          settings: false,
          select: false,
          reason,
        });
      expect(snapshot.storage).toBe(storageReady ? "ready" : "requires_schema");
      expect(snapshot.permissions.manageAppearance).toBe(manageAppearance);
    },
  );

  it("projects explicit allowlists instead of plans/receipts/settings/manifests and raw catalog state", () => {
    const input = context();
    Object.assign(input.store, {
      privateCredentials: "secret-not-public",
      actorKey: "users:private",
      requestId: "uuid-private",
    });
    input.store.targets.admin.current!.settings = {
      panelWidth: 280,
      density: "comfortable",
      privateDraft: "hidden-settings",
    };
    const encoded = JSON.stringify(mapInstalledTemplatesSnapshot(input));
    for (const hidden of [
      "secret-not-public",
      "users:private",
      "uuid-private",
      "hidden-settings",
      "manifestHash",
      "catalogHash",
      "settingsSchema",
      "actorKey",
      "requestId",
      "resolveSettings",
    ])
      expect(encoded).not.toContain(hidden);
  });

  it("rejects native package/palette/settings fiction and mismatched stable identity keys", () => {
    const native = mapInstalledTemplatesSnapshot(context()).entries[0];
    for (const patch of [
      { packageName: "payload" },
      {
        palettes: [
          {
            id: "payload",
            version: "3.88.0",
            label: "Payload",
            modes: ["light"],
          },
        ],
      },
      { actions: { settings: true, select: true, reason: null } },
      { targets: ["frontend"] },
      { key: "builtin:payload-native@3.87.0" },
      { privateToken: "hidden" },
    ])
      expect(
        installedTemplateEntrySchema.safeParse({ ...native, ...patch }).success,
      ).toBe(false);
  });

  it("rejects confirmation/actions inconsistent with runtime, storage, ACL and unique inventory identity", () => {
    const snapshot = mapInstalledTemplatesSnapshot(context());
    for (const patch of [
      {
        runtime: {
          status: "unverified",
          buildId: null,
          sourceVersion: null,
          builtAt: null,
        },
      },
      { storage: "requires_schema" },
      { permissions: { manageAppearance: false } },
      { entries: [...snapshot.entries, snapshot.entries[1]] },
      { actorKey: "users:private" },
    ])
      expect(
        installedTemplatesSnapshotSchema.safeParse({ ...snapshot, ...patch })
          .success,
      ).toBe(false);
  });
});
