// @vitest-environment node
/**
 * @file tests/int/extension-layout-prepare.int.spec.ts
 * @version 1.0.0
 * @date 2026-11-18
 * @description Проверяет exact layout prepare, CAS/replay и закрытый durable writer через pure и HTTP boundaries.
 * @see documentation/specifications/extension-management.md
 */
import type { PayloadRequest } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import legacyManifest from "@realize/template-realize/manifest.json";
import legacySettingsSchema from "@realize/template-realize/settings.schema.json";
import { resolveRealizeSettings } from "@realize/template-realize/settings";
import { controlPanelManifest } from "@realize/template-realizeai-control-panel/manifest";
import { controlPanelLayoutCatalog } from "@realize/template-realizeai-control-panel/layouts";
import controlPanelSettingsSchema from "@realize/template-realizeai-control-panel/settings.schema.json";
import { resolveControlPanelSettings } from "@realize/template-realizeai-control-panel/settings";
import {
  resolveTemplateLayout,
  type TemplateLayoutCatalogInput,
} from "@realize/template-contracts";
import {
  extensionAppearancePlanDtoSchema,
  extensionCatalogDtoSchema,
  mapExtensionCatalog,
  mapInstalledTemplatesSnapshot,
  type AdminShellPolicy,
  type ExtensionAppearanceStore,
  type ExtensionCatalog,
  type ExtensionCatalogRegistration,
  type ExtensionTemplateReadiness,
  type ExtensionAssignment,
  type InstalledTemplatesLoaderContext,
} from "@realize/payload-extension-manager/contracts";
import {
  applyAdminShell,
  applyExtensionAppearance,
  createAdminShellStore,
  createExtensionAppearanceStore,
  createExtensionCatalog,
  hashAdminShellPolicy,
  prepareAdminShell,
  prepareExtensionAppearance,
  previewExtensionAppearance,
  resolveExtensionAssignment,
} from "@realize/payload-extension-manager/server";
import { hashExtensionValue } from "../../packages/payload-extension-manager/src/appearance/hashExtensionValue.server";
import { resolveExtensionManagerOptions } from "../../packages/payload-extension-manager/src/extensionManagerOptions.config";
import { createExtensionManagerEndpoints } from "../../packages/payload-extension-manager/src/server/extensionManagerEndpoints.controller";

// Единственная замена HTTP-контура: SQL repository. Service, ACL, compiler и lifecycle выполняются реально.
const repository = vi.hoisted(() => ({ read: vi.fn(), mutate: vi.fn() }));
vi.mock(
  "../../packages/payload-extension-manager/src/persistence/ExtensionAppearance.repository",
  () => ({
    ExtensionAppearanceRepository: class {
      read = repository.read;
      mutate = repository.mutate;
    },
  }),
);

const nowMs = Date.parse("2026-11-18T12:00:00.000Z");
const actorKey = "users:17";
const requestId = "a00d1e27-9fe1-46f3-833b-df56d3723411";
const nextRequestId = "a00d1e27-9fe1-46f3-833b-df56d3723412";
const applyRequestId = "a00d1e27-9fe1-46f3-833b-df56d3723413";
const planId = "fc8e2c5d-d49b-423e-9724-aad80fd74b11";
const nextPlanId = "fc8e2c5d-d49b-423e-9724-aad80fd74b12";
const buildId = "layout-aware-prepare-fixture";
const hostCompatibility = {
  contractVersion: "1.0" as const,
  platformVersion: "1.0.0",
  reactVersion: "19.2.8",
  nextVersion: "16.4.5",
};
const controlSelection = {
  templateId: "realizeai-control-panel",
  templateVersion: "0.1.0",
  target: "admin" as const,
  paletteId: "realizeai-control-panel",
  paletteVersion: "0.1.0",
  mode: "light" as const,
};
const legacySelection = {
  ...controlSelection,
  templateId: "realize",
  paletteId: "realize",
};
const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const expectCode = (action: () => unknown, code: string) =>
  expect(action).toThrowError(expect.objectContaining({ code }));

function rawLayouts(): TemplateLayoutCatalogInput {
  return JSON.parse(
    JSON.stringify(controlPanelLayoutCatalog),
  ) as TemplateLayoutCatalogInput;
}

function legacyRegistration(): ExtensionCatalogRegistration {
  return {
    manifest: legacyManifest,
    settingsSchema: legacySettingsSchema,
    resolveSettings: resolveRealizeSettings,
  };
}

function layoutRegistration(
  catalog: unknown = rawLayouts(),
  readiness: ExtensionTemplateReadiness = "ready",
): ExtensionCatalogRegistration {
  return {
    manifest: controlPanelManifest,
    settingsSchema: controlPanelSettingsSchema,
    resolveSettings: resolveControlPanelSettings,
    readiness,
    layouts: {
      templateIdentity: { namespace: "realize", id: "realizeai-control-panel" },
      catalog,
    },
  };
}

function runtime(registration = layoutRegistration()) {
  return createExtensionCatalog({
    entries: [legacyRegistration(), registration],
    hostCompatibility,
    runtimeBuildId: buildId,
  });
}

function assignCommand(
  catalog: ExtensionCatalog,
  settings: Record<string, string | number> = {},
  legacy = false,
) {
  return {
    action: "assign" as const,
    target: "admin" as const,
    expectedRevision: 0,
    expectedCatalogHash: catalog.catalogHash,
    selection: legacy ? legacySelection : controlSelection,
    settings,
  };
}

function prepareEnabled(
  catalog = runtime(),
  settings: Record<string, string | number> = {},
  store = createExtensionAppearanceStore(),
) {
  return prepareExtensionAppearance({
    catalog,
    store,
    actorKey,
    requestId,
    planId,
    nowMs,
    input: assignCommand(catalog, settings),
    layoutAssignmentWrites: "enabled",
  });
}

function applyEnabled(
  catalog: ExtensionCatalog,
  prepared: ReturnType<typeof prepareEnabled>,
) {
  return applyExtensionAppearance({
    catalog,
    store: prepared.store,
    actorKey,
    requestId: applyRequestId,
    nowMs: nowMs + 1,
    input: {
      planId: prepared.plan.planId,
      expectedPlanHash: prepared.plan.planHash,
    },
    layoutAssignmentWrites: "enabled",
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(nowMs);
});
afterEach(() => vi.restoreAllMocks());

describe("Регистрация exact layout catalog", () => {
  it("сохраняет legacy hash без metadata и добавляет layout hash только новой записи", () => {
    const legacy = createExtensionCatalog({
      entries: [legacyRegistration()],
      hostCompatibility,
      runtimeBuildId: "layout-reader-legacy-fixture",
    });
    expect(legacy.catalogHash).toBe(
      "b46534aa9ff00c331977efdb3a6679b18a35cd5724b8080249648692ff5b8931",
    );
    expect(Object.hasOwn(legacy.entries[0], "layoutCatalog")).toBe(false);
    const registered = layoutRegistration();
    const { layouts: _layouts, ...withoutLayouts } = registered;
    const before = runtime(withoutLayouts);
    const after = runtime(registered);
    expect(after.catalogHash).not.toBe(before.catalogHash);
    expect(after.entries.map((entry) => entry.manifestHash)).toEqual(
      before.entries.map((entry) => entry.manifestHash),
    );
    const dto = mapExtensionCatalog(after);
    expect(extensionCatalogDtoSchema.parse(wire(dto))).toEqual(dto);
    const entry = dto.entries.find(
      (item) => item.manifest.id === controlSelection.templateId,
    )!;
    expect(entry.layoutCatalog?.catalogHash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.layoutCatalog?.template).toEqual({
      identity: { namespace: "realize", id: controlSelection.templateId },
      version: controlSelection.templateVersion,
    });
  });

  it("использует explicit global mapping вместо угадывания namespace/id из native template ID", () => {
    const data = rawLayouts();
    const global = { namespace: "vendor", id: "custom.panel" };
    data.template.identity = global;
    for (const descriptor of data.descriptors)
      descriptor.template = { ...global };
    const registered = layoutRegistration(data);
    registered.layouts = { templateIdentity: global, catalog: data };
    const catalog = runtime(registered);
    const assignment = resolveExtensionAssignment({
      catalog,
      target: "admin",
      selection: controlSelection,
      settings: {},
    });
    expect(assignment.layout?.reference.identity.id).toBe(
      "realizeai-control-panel.layout-default",
    );
    expect(
      catalog.entries.find(
        (entry) => entry.manifest.id === controlSelection.templateId,
      )?.layoutCatalog?.template.identity,
    ).toEqual(global);
    const mismatch = layoutRegistration(data);
    expectCode(() => runtime(mismatch), "INVALID_CATALOG");
  });

  it("отклоняет неверную native version, surface, profile и подменённый claimed hash", () => {
    const version = rawLayouts();
    version.template.version = "0.2.0";
    expectCode(() => runtime(layoutRegistration(version)), "INVALID_CATALOG");
    const foreignSurface = layoutRegistration();
    foreignSurface.manifest = {
      ...controlPanelManifest,
      entries: { frontend: "./frontend" },
      targets: [{ target: "frontend", screens: ["page"] }],
    };
    expectCode(() => runtime(foreignSurface), "INVALID_CATALOG");
    const profile = rawLayouts();
    expectCode(
      () =>
        runtime(
          layoutRegistration({
            ...profile,
            descriptors: profile.descriptors.map((item) => ({
              ...item,
              profile: { id: "foreign.frame", version: "0.1.0" },
            })),
          }),
        ),
      "INVALID_CATALOG",
    );
    const valid = runtime().entries.find(
      (entry) => entry.manifest.id === controlSelection.templateId,
    )!.layoutCatalog!;
    const changed = rawLayouts();
    changed.descriptors[0].description =
      "Другой descriptor с прежним claimed hash.";
    expectCode(
      () =>
        runtime(
          layoutRegistration({ ...changed, catalogHash: valid.catalogHash }),
        ),
      "INVALID_CATALOG",
    );
  });

  it("не захватывает Admin layout для frontend selection dual-target шаблона", () => {
    const registered = layoutRegistration();
    registered.manifest = {
      ...controlPanelManifest,
      entries: { ...controlPanelManifest.entries, frontend: "./frontend" },
      targets: [
        ...controlPanelManifest.targets,
        { target: "frontend", screens: ["page"] },
      ],
    };
    const catalog = runtime(registered);
    expectCode(
      () =>
        resolveExtensionAssignment({
          catalog,
          target: "frontend",
          selection: { ...controlSelection, target: "frontend" },
          settings: {},
        }),
      "ASSIGNMENT_UNAVAILABLE",
    );
  });

  it("возвращает validation failure для malformed DTO settingsSchema без исключения", () => {
    const dto = mapExtensionCatalog(runtime());
    expect(
      extensionCatalogDtoSchema.safeParse({
        ...dto,
        entries: dto.entries.map((entry) => ({
          ...entry,
          settingsSchema: null,
        })),
      }).success,
    ).toBe(false);
  });
});

describe("Pure prepare, pins и прежние CAS guards", () => {
  it.each([undefined, "default", "without-topbar"])(
    "захватывает exact layout для выбора %s при explicit fixture gate-on",
    (layoutId) => {
      const catalog = runtime();
      const settings: Record<string, string | number> =
        layoutId === undefined ? {} : { layoutId };
      const prepared = prepareEnabled(catalog, settings);
      const desired = prepared.plan.desiredAssignment;
      const entry = catalog.entries.find(
        (item) => item.manifest.id === controlSelection.templateId,
      )!;
      const selected = resolveTemplateLayout(entry.layoutCatalog!, layoutId);
      expect(desired.layout).toEqual({
        schemaVersion: "1.0",
        localId: selected.localId,
        reference: selected.reference,
        catalogHash: entry.layoutCatalog!.catalogHash,
      });
      expect(Object.hasOwn(desired.settings, "layoutId")).toBe(
        layoutId !== undefined,
      );
      expect(
        extensionAppearancePlanDtoSchema.parse(wire(prepared.plan)),
      ).toEqual(prepared.plan);
      expect(
        previewExtensionAppearance({
          catalog,
          store: prepared.store,
          actorKey,
          planId,
          nowMs: nowMs + 1,
        }),
      ).toEqual(prepared.plan);
      expect(prepared.store.targets.admin.current).toBeNull();
    },
  );

  it.each([undefined, "disabled"] as const)(
    "закрывает новый prepare при gate %s без неполного legacy plan",
    (policy) => {
      const catalog = runtime();
      const store = createExtensionAppearanceStore();
      const before = wire(store);
      expectCode(
        () =>
          prepareExtensionAppearance({
            catalog,
            store,
            actorKey,
            requestId,
            planId,
            nowMs,
            input: assignCommand(catalog),
            layoutAssignmentWrites: policy,
          }),
        "LAYOUT_BINDING_WRITES_DISABLED",
      );
      expect(store).toEqual(before);
    },
  );

  it("сохраняет legacy prepare/apply без нового флага и отказывает неизвестному alias", () => {
    const catalog = runtime();
    const prepared = prepareExtensionAppearance({
      catalog,
      store: createExtensionAppearanceStore(),
      actorKey,
      requestId,
      planId,
      nowMs,
      input: assignCommand(catalog, {}, true),
    });
    expect(Object.hasOwn(prepared.plan.desiredAssignment, "layout")).toBe(
      false,
    );
    expect(
      applyExtensionAppearance({
        catalog,
        store: prepared.store,
        actorKey,
        requestId: applyRequestId,
        nowMs: nowMs + 1,
        input: { planId, expectedPlanHash: prepared.plan.planHash },
      }).receipt.appliedRevision,
    ).toBe(1);
    expectCode(
      () => prepareEnabled(catalog, { layoutId: "missing" }),
      "INVALID_SETTINGS",
    );
  });

  it("отклоняет старый catalog guard после изменения descriptor и сохраняет manifest hash", () => {
    const catalog = runtime();
    const prior = prepareEnabled(catalog);
    const metadata = rawLayouts();
    metadata.descriptors[0].description = "Новая metadata ревизия draft.";
    const next = runtime(layoutRegistration(metadata));
    expect(next.catalogHash).not.toBe(catalog.catalogHash);
    expect(next.entries.map((entry) => entry.manifestHash)).toEqual(
      catalog.entries.map((entry) => entry.manifestHash),
    );
    expectCode(
      () =>
        prepareExtensionAppearance({
          catalog: next,
          store: createExtensionAppearanceStore(),
          actorKey,
          requestId,
          planId,
          nowMs,
          input: assignCommand(catalog),
          layoutAssignmentWrites: "enabled",
        }),
      "CATALOG_CHANGED",
    );
    expectCode(
      () =>
        previewExtensionAppearance({
          catalog: next,
          store: prior.store,
          actorKey,
          planId,
          nowMs,
        }),
      "CATALOG_CHANGED",
    );
  });

  it("различает новый inherited default и explicit default, а смена exact version делает прежний plan stale", () => {
    const original = runtime();
    const prior = prepareEnabled(original);
    const changedDefault = rawLayouts();
    changedDefault.defaultLayoutId = "without-topbar";
    const nextDefault = runtime(layoutRegistration(changedDefault));
    const inherited = prepareEnabled(nextDefault).plan.desiredAssignment;
    const explicit = prepareEnabled(nextDefault, { layoutId: "default" }).plan
      .desiredAssignment;
    expect(inherited.layout?.localId).toBe("without-topbar");
    expect(Object.hasOwn(inherited.settings, "layoutId")).toBe(false);
    expect(explicit.layout?.localId).toBe("default");
    expect(explicit.settings.layoutId).toBe("default");
    expect(inherited.layout?.reference.identity).not.toEqual(
      explicit.layout?.reference.identity,
    );
    expectCode(
      () =>
        previewExtensionAppearance({
          catalog: nextDefault,
          store: prior.store,
          actorKey,
          planId,
          nowMs,
        }),
      "CATALOG_CHANGED",
    );

    const changedVersion = rawLayouts();
    const alias = changedVersion.aliases.find(
      (item) => item.localId === "default",
    )!;
    const definition = changedVersion.descriptors.find(
      (item) =>
        item.identity.namespace === alias.layout.identity.namespace &&
        item.identity.id === alias.layout.identity.id,
    )!;
    definition.version = "0.1.1";
    alias.layout.version = "0.1.1";
    const nextVersion = runtime(layoutRegistration(changedVersion));
    const selected = prepareEnabled(nextVersion).plan.desiredAssignment;
    expect(selected.layout?.reference).toEqual(alias.layout);
    expect(selected.layout?.reference.version).toBe("0.1.1");
    expect(nextVersion.catalogHash).not.toBe(original.catalogHash);
    expectCode(
      () =>
        previewExtensionAppearance({
          catalog: nextVersion,
          store: prior.store,
          actorKey,
          planId,
          nowMs,
        }),
      "CATALOG_CHANGED",
    );
  });

  it("сохраняет revision/base/actor/TTL guards у pinned plan", () => {
    const catalog = runtime();
    const store = createExtensionAppearanceStore();
    store.targets.admin.revision = 1;
    expectCode(() => prepareEnabled(catalog, {}, store), "REVISION_CONFLICT");
    const prepared = prepareEnabled(catalog);
    const drift = wire(prepared.store);
    drift.targets.admin.current = resolveExtensionAssignment({
      catalog,
      target: "admin",
      selection: legacySelection,
      settings: {},
    });
    expectCode(
      () =>
        previewExtensionAppearance({
          catalog,
          store: drift,
          actorKey,
          planId,
          nowMs,
        }),
      "STATE_CHANGED",
    );
    expectCode(
      () =>
        previewExtensionAppearance({
          catalog,
          store: prepared.store,
          actorKey: "users:18",
          planId,
          nowMs,
        }),
      "PLAN_ACTOR_MISMATCH",
    );
    expectCode(
      () =>
        previewExtensionAppearance({
          catalog,
          store: prepared.store,
          actorKey,
          planId,
          nowMs: Date.parse(prepared.plan.expiresAt),
        }),
      "PLAN_EXPIRED",
    );
  });

  it("разрешает прежние immutable receipts до gate, но не новый input с тем же UUID", () => {
    const catalog = runtime();
    const prepared = prepareEnabled(catalog);
    const replay = prepareExtensionAppearance({
      catalog,
      store: prepared.store,
      actorKey,
      requestId,
      planId,
      nowMs: nowMs + 1,
      input: assignCommand(catalog),
    });
    expect(replay.replayed).toBe(true);
    expect(replay.plan).toEqual(prepared.plan);
    expect(replay.store).toEqual(prepared.store);
    expectCode(
      () =>
        prepareExtensionAppearance({
          catalog,
          store: prepared.store,
          actorKey,
          requestId,
          planId,
          nowMs,
          input: assignCommand(catalog, { density: "compact" }),
        }),
      "REPLAY_CONFLICT",
    );
    const applied = applyEnabled(catalog, prepared);
    const again = applyExtensionAppearance({
      catalog,
      store: applied.store,
      actorKey,
      requestId: applyRequestId,
      nowMs: nowMs + 2,
      input: { planId, expectedPlanHash: prepared.plan.planHash },
    });
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(applied.receipt);
    expect(again.store).toEqual(applied.store);
  });

  it("не позволяет seeded ready plan обойти выключенный apply gate", () => {
    const catalog = runtime();
    const prepared = prepareEnabled(catalog);
    const before = wire(prepared.store);
    expectCode(
      () =>
        applyExtensionAppearance({
          catalog,
          store: prepared.store,
          actorKey,
          requestId: applyRequestId,
          nowMs: nowMs + 1,
          input: { planId, expectedPlanHash: prepared.plan.planHash },
        }),
      "LAYOUT_BINDING_WRITES_DISABLED",
    );
    expect(prepared.store).toEqual(before);
  });

  it.each(["previous", "pending", "history"] as const)(
    "не сериализует старый layout из %s при новом legacy prepare",
    (location) => {
      const catalog = runtime();
      const pinned = prepareEnabled(catalog);
      const legacy = resolveExtensionAssignment({
        catalog,
        target: "admin",
        selection: legacySelection,
        settings: {},
      });
      const store = createExtensionAppearanceStore({ admin: legacy });
      if (location === "previous")
        store.targets.admin.previous = pinned.plan.desiredAssignment;
      if (location === "pending") store.plans = wire(pinned.store.plans);
      if (location === "history") store.receipts = wire(pinned.store.receipts);
      const before = wire(store);
      expectCode(
        () =>
          prepareExtensionAppearance({
            catalog,
            store,
            actorKey,
            requestId: nextRequestId,
            planId: nextPlanId,
            nowMs,
            input: assignCommand(catalog, {}, true),
          }),
        "LAYOUT_BINDING_WRITES_DISABLED",
      );
      expect(store).toEqual(before);
    },
  );

  it("recover сохраняет exact previous binding и не переосмысляет прежнее отсутствие pin", () => {
    const catalog = runtime();
    const current = resolveExtensionAssignment({
      catalog,
      target: "admin",
      selection: controlSelection,
      settings: {},
    });
    const first = prepareEnabled(
      catalog,
      { density: "compact" },
      createExtensionAppearanceStore({ admin: current }),
    );
    const applied = applyEnabled(catalog, first);
    const recover = (store: ExtensionAppearanceStore) =>
      prepareExtensionAppearance({
        catalog,
        store,
        actorKey,
        requestId: nextRequestId,
        planId: nextPlanId,
        nowMs: nowMs + 2,
        input: {
          action: "recover",
          target: "admin",
          expectedRevision: 1,
          expectedCatalogHash: catalog.catalogHash,
        },
        layoutAssignmentWrites: "enabled",
      });
    expect(recover(applied.store).plan.desiredAssignment).toEqual(current);
    const missing = wire(applied.store);
    const { layout: _layout, ...unbound } = current;
    missing.targets.admin.previous = unbound;
    expectCode(() => recover(missing), "ASSIGNMENT_UNAVAILABLE");
    const stale = wire(applied.store);
    Reflect.set(
      stale.targets.admin.previous!.layout!.reference,
      "version",
      "0.1.1",
    );
    expectCode(() => recover(stale), "ASSIGNMENT_UNAVAILABLE");
  });

  it("Admin Shell writer проверяет pinned snapshots даже при выборе native", () => {
    const catalog = runtime();
    const policy: AdminShellPolicy = {
      enabled: { native: true, template: true },
      defaultMode: "native",
      fallbackMode: "native",
      nativeVersion: "3.88.0",
      nativeRoute: "/admin",
      templateRoute: "/system",
    };
    const appearance = {
      catalog,
      store: createExtensionAppearanceStore({
        admin: resolveExtensionAssignment({
          catalog,
          target: "admin",
          selection: controlSelection,
          settings: {},
        }),
      }),
    };
    const base = {
      store: createAdminShellStore(policy),
      policy,
      appearance,
      actorKey,
      requestId,
      planId,
      nowMs,
      input: {
        action: "select",
        mode: "template",
        expectedRevision: 0,
        expectedPolicyHash: hashAdminShellPolicy(policy),
      },
    };
    expectCode(() => prepareAdminShell(base), "LAYOUT_BINDING_WRITES_DISABLED");
    const prepared = prepareAdminShell({
      ...base,
      layoutAssignmentWrites: "enabled",
    });
    expectCode(
      () =>
        applyAdminShell({
          store: prepared.store,
          policy,
          appearance,
          actorKey,
          requestId: applyRequestId,
          nowMs: nowMs + 1,
          input: { planId, expectedPlanHash: prepared.plan.planHash },
        }),
      "LAYOUT_BINDING_WRITES_DISABLED",
    );
    expectCode(
      () =>
        prepareAdminShell({
          ...base,
          store: prepared.store,
          requestId: nextRequestId,
          planId: nextPlanId,
          input: { ...base.input, mode: "native" },
        }),
      "LAYOUT_BINDING_WRITES_DISABLED",
    );
    const withoutReceipt = { ...prepared.store, receipts: [] };
    expectCode(
      () =>
        applyAdminShell({
          store: withoutReceipt,
          policy,
          appearance,
          actorKey,
          requestId: applyRequestId,
          nowMs: nowMs + 1,
          input: { planId, expectedPlanHash: prepared.plan.planHash },
        }),
      "LAYOUT_BINDING_WRITES_DISABLED",
    );
  });

  it("inventory помечает отсутствующий или неверный pin как invalid_assignment, сохраняя selected отдельно от active", () => {
    const catalog = runtime();
    const valid = resolveExtensionAssignment({
      catalog,
      target: "admin",
      selection: controlSelection,
      settings: {},
    });
    const inventory = (assignment: ExtensionAssignment) => {
      const context: InstalledTemplatesLoaderContext = {
        catalog,
        store: createExtensionAppearanceStore({ admin: assignment }),
        bootstrapStore: createExtensionAppearanceStore(),
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
        assignmentByTarget: { admin: assignment, frontend: null },
        requiresRecovery: [],
        runtime: {
          schemaVersion: "1.0",
          buildId,
          sourceVersion: "1.0.0",
          builtAt: new Date(nowMs - 1000).toISOString(),
          catalogHash: catalog.catalogHash,
        },
        storageReady: true,
        manageAppearance: true,
        observedAt: new Date(nowMs).toISOString(),
      };
      return mapInstalledTemplatesSnapshot(context);
    };
    const accepted = inventory(valid);
    expect(accepted.unavailableAssignments).toEqual([]);
    expect(
      accepted.entries.find((entry) => entry.id === controlSelection.templateId)
        ?.usage.activeTargets,
    ).toEqual(["admin"]);
    const { layout: _layout, ...missing } = valid;
    const wrongVersion = wire(valid);
    Reflect.set(wrongVersion.layout!.reference, "version", "0.1.1");
    const wrongHash = wire(valid);
    Reflect.set(wrongHash.layout!, "catalogHash", "f".repeat(64));
    for (const assignment of [missing, wrongVersion, wrongHash]) {
      const snapshot = inventory(assignment);
      expect(snapshot.unavailableAssignments).toEqual([
        {
          target: "admin",
          templateId: controlSelection.templateId,
          templateVersion: controlSelection.templateVersion,
          reason: "invalid_assignment",
        },
      ]);
      const entry = snapshot.entries.find(
        (item) => item.id === controlSelection.templateId,
      )!;
      expect(entry.usage.selectedTargets).toEqual(["admin"]);
      expect(entry.usage.activeTargets).toEqual([]);
      expect(entry.actions.settings).toBe(false);
    }
  });
});

/** Fixture считает только содержательные commits в памяти; соединение с PostgreSQL не создаётся. */
function httpFixture(
  seed: ExtensionAppearanceStore | null = null,
  bootstrapLayoutAdmin = false,
) {
  let memory = seed === null ? null : wire(seed);
  let commits = 0;
  let beforeMutation: ((store: ExtensionAppearanceStore) => void) | undefined;
  const legacy = legacyRegistration();
  if (bootstrapLayoutAdmin)
    legacy.manifest = {
      ...legacyManifest,
      entries: { ...legacyManifest.entries, frontend: "./frontend" },
      targets: [
        ...legacyManifest.targets,
        { target: "frontend", screens: ["page"] },
      ],
    };
  const entries = [legacy, layoutRegistration()];
  const catalog = createExtensionCatalog({
    entries,
    hostCompatibility,
    runtimeBuildId: buildId,
  });
  const payload = {
    config: { csrf: ["https://trusted.test"], serverURL: "http://localhost" },
    jobs: { queue: vi.fn() },
    create: vi.fn(),
    update: vi.fn(),
  };
  const endpoints = createExtensionManagerEndpoints(
    resolveExtensionManagerOptions({
      userCollection: "users",
      scopeKey: "fixture:layout-prepare",
      catalog: entries,
      hostCompatibility,
      runtimeBuildId: async () => buildId,
      defaultAdmin: {
        selection: bootstrapLayoutAdmin ? controlSelection : legacySelection,
        settings: {},
      },
      access: {
        canReadCatalog: () => true,
        canManageAppearance: () => true,
        canInstallCode: () => true,
      },
    }),
  );
  repository.read.mockImplementation(async () => ({
    store: memory === null ? null : wire(memory),
    storageReady: true,
  }));
  repository.mutate.mockImplementation(
    async (
      _req: unknown,
      _scope: string,
      bootstrap: ExtensionAppearanceStore,
      operation: (
        store: ExtensionAppearanceStore,
      ) => Promise<{ store: ExtensionAppearanceStore; result: unknown }>,
    ) => {
      const current = wire(memory ?? bootstrap);
      if (beforeMutation) {
        beforeMutation(current);
        memory = wire(current);
      }
      const outcome = await operation(current);
      if (hashExtensionValue(outcome.store) !== hashExtensionValue(current)) {
        memory = wire(outcome.store);
        commits += 1;
      }
      return outcome.result;
    },
  );
  const call = async (
    input: {
      path?: string;
      method?: "get" | "post";
      body?: unknown;
      requestId?: string;
      user?: { id: number; collection: string } | null;
    } = {},
  ) => {
    const path = input.path ?? "";
    const method = input.method ?? "get";
    const endpoint = endpoints.find(
      (item) =>
        item.path === `/realize-extensions${path}` && item.method === method,
    );
    if (!endpoint) throw new Error("Missing layout prepare fixture endpoint");
    const request = new Request(
      `http://localhost/api/realize-extensions${path}`,
      {
        method: method.toUpperCase(),
        headers:
          method === "post"
            ? {
                "content-type": "application/json",
                "idempotency-key": input.requestId ?? requestId,
              }
            : {},
        ...(method === "post"
          ? { body: JSON.stringify(input.body ?? {}) }
          : {}),
      },
    );
    return endpoint.handler(
      Object.assign(request, {
        payload,
        user:
          input.user === undefined
            ? { id: 17, collection: "users" }
            : input.user,
        routeParams: { id: planId },
      }) as unknown as PayloadRequest,
    );
  };
  return {
    catalog,
    payload,
    call,
    state: () => wire(memory),
    commits: () => commits,
    beforeMutation: (callback: (store: ExtensionAppearanceStore) => void) => {
      beforeMutation = callback;
    },
  };
}

describe("HTTP с настоящим service и закрытым durable layout writer", () => {
  it("читает layout catalog, но блокирует ready prepare без commit и установки jobs", async () => {
    const fixture = httpFixture();
    const snapshot = await fixture.call();
    expect(snapshot.status).toBe(200);
    const body = await snapshot.json();
    expect(extensionCatalogDtoSchema.safeParse(body.data.catalog).success).toBe(
      true,
    );
    expect(
      body.data.catalog.entries.find(
        (entry: { manifest: { id: string } }) =>
          entry.manifest.id === controlSelection.templateId,
      ).layoutCatalog.catalogHash,
    ).toMatch(/^[a-f0-9]{64}$/);
    const response = await fixture.call({
      path: "/appearance/plans",
      method: "post",
      body: assignCommand(fixture.catalog),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "LAYOUT_BINDING_WRITES_DISABLED" },
    });
    expect(fixture.commits()).toBe(0);
    expect(fixture.state()).toBeNull();
    expect(fixture.payload.create).not.toHaveBeenCalled();
    expect(fixture.payload.update).not.toHaveBeenCalled();
    expect(fixture.payload.jobs.queue).not.toHaveBeenCalled();
  });

  it("не сохраняет pinned Admin bootstrap вместе с новым legacy frontend plan", async () => {
    const fixture = httpFixture(null, true);
    const read = await fixture.call();
    expect(read.status).toBe(200);
    const snapshot = await read.json();
    expect(snapshot.data.targets.admin.current.layout.reference.version).toBe(
      "0.1.0",
    );
    expect(snapshot.data.targets.frontend.current).toBeNull();
    expect(fixture.state()).toBeNull();
    const response = await fixture.call({
      path: "/appearance/plans",
      method: "post",
      body: {
        ...assignCommand(fixture.catalog, {}, true),
        target: "frontend",
        selection: { ...legacySelection, target: "frontend" },
      },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "LAYOUT_BINDING_WRITES_DISABLED" },
    });
    expect(fixture.commits()).toBe(0);
    expect(fixture.state()).toBeNull();
    expect(fixture.payload.create).not.toHaveBeenCalled();
    expect(fixture.payload.update).not.toHaveBeenCalled();
  });

  it("не принимает client gate/layout и продолжает legacy prepare", async () => {
    const fixture = httpFixture();
    const command = assignCommand(fixture.catalog);
    const desired = prepareEnabled(fixture.catalog).plan.desiredAssignment;
    for (const injected of [
      { ...command, layoutAssignmentWrites: "enabled" },
      { ...command, layout: desired.layout },
    ]) {
      const rejected = await fixture.call({
        path: "/appearance/plans",
        method: "post",
        body: injected,
      });
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toMatchObject({
        error: { code: "INVALID_INPUT" },
      });
    }
    expect(fixture.commits()).toBe(0);
    const legacy = await fixture.call({
      path: "/appearance/plans",
      method: "post",
      body: assignCommand(fixture.catalog, {}, true),
      requestId: nextRequestId,
    });
    expect(legacy.status).toBe(200);
    const body = await legacy.json();
    expect(
      extensionAppearancePlanDtoSchema.safeParse(body.data.plan).success,
    ).toBe(true);
    expect(Object.hasOwn(body.data.plan.desiredAssignment, "layout")).toBe(
      false,
    );
    expect(fixture.commits()).toBe(1);
  });

  it("проверяет revision внутри repository callback до gate и не коммитит новый plan", async () => {
    const fixture = httpFixture();
    fixture.beforeMutation((store) => {
      store.targets.admin.revision += 1;
    });
    const response = await fixture.call({
      path: "/appearance/plans",
      method: "post",
      body: assignCommand(fixture.catalog),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "REVISION_CONFLICT" },
    });
    expect(fixture.commits()).toBe(0);
    expect(fixture.state()?.plans).toEqual([]);
  });

  it("replay и preview читают seeded pinned plan без нового commit, apply остаётся закрыт", async () => {
    const catalog = runtime();
    const prepared = prepareEnabled(catalog);
    const fixture = httpFixture(prepared.store);
    const replay = await fixture.call({
      path: "/appearance/plans",
      method: "post",
      body: assignCommand(catalog),
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      data: {
        replayed: true,
        plan: {
          planHash: prepared.plan.planHash,
          desiredAssignment: { layout: prepared.plan.desiredAssignment.layout },
        },
      },
    });
    const preview = await fixture.call({ path: "/appearance/plans/:id" });
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      data: {
        desiredAssignment: { layout: prepared.plan.desiredAssignment.layout },
      },
    });
    const response = await fixture.call({
      path: "/appearance/apply",
      method: "post",
      requestId: applyRequestId,
      body: { planId, expectedPlanHash: prepared.plan.planHash },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "LAYOUT_BINDING_WRITES_DISABLED" },
    });
    expect(fixture.commits()).toBe(0);
    expect(fixture.state()).toEqual(prepared.store);
  });

  it("известный apply receipt воспроизводится при закрытом gate без записи нового состояния", async () => {
    const catalog = runtime();
    const prepared = prepareEnabled(catalog);
    const applied = applyEnabled(catalog, prepared);
    const fixture = httpFixture(applied.store);
    const response = await fixture.call({
      path: "/appearance/apply",
      method: "post",
      requestId: applyRequestId,
      body: { planId, expectedPlanHash: prepared.plan.planHash },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { replayed: true, receipt: applied.receipt },
    });
    expect(fixture.commits()).toBe(0);
    expect(fixture.state()).toEqual(applied.store);
  });

  it("не открывает catalog или mutation анонимному actor", async () => {
    const fixture = httpFixture();
    expect((await fixture.call({ user: null })).status).toBe(401);
    expect(
      (
        await fixture.call({
          path: "/appearance/plans",
          method: "post",
          user: null,
          body: assignCommand(fixture.catalog),
        })
      ).status,
    ).toBe(401);
    expect(repository.read).not.toHaveBeenCalled();
    expect(repository.mutate).not.toHaveBeenCalled();
    expect(fixture.commits()).toBe(0);
  });
});
