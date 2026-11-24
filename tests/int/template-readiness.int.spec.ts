// @vitest-environment node
/**
 * @file tests/int/template-readiness.int.spec.ts
 * @version 1.0.0
 * @date 2026-11-12
 * @description Проверяет host admission preview-only, replay, runtime fallback и отдельную доступность настроек.
 * @see documentation/specifications/extension-management.md
 */
import type { PayloadRequest } from "payload";
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "@realize/template-realize/manifest.json";
import settingsSchema from "@realize/template-realize/settings.schema.json";
import { resolveRealizeSettings } from "@realize/template-realize/settings";
import {
  adminShellPlanDtoSchema,
  extensionAppearancePlanDtoSchema,
  extensionCatalogDtoSchema,
  installedTemplatesSnapshotSchema,
  mapExtensionCatalog,
  mapInstalledTemplatesSnapshot,
  type AdminShellPolicy,
  type ExtensionCatalog,
  type ExtensionCatalogRegistration,
  type ExtensionTemplateReadiness,
  type ExtensionAppearanceStore,
  type InstalledTemplatesLoaderContext,
} from "../../packages/payload-extension-manager/src/extensionManagerContracts.index";
import {
  applyExtensionAppearance,
  createExtensionAppearanceStore,
  createExtensionCatalog,
  hashExtensionValue,
  prepareExtensionAppearance,
  previewExtensionAppearance,
  resolveExtensionAssignment,
} from "../../packages/payload-extension-manager/src/appearance/extensionAppearance.server.index";
import { createExtensionRuntimeState } from "../../packages/payload-extension-manager/src/server/createExtensionRuntimeState.service";
import { resolveStoredExtensionAssignment } from "../../packages/payload-extension-manager/src/server/resolveStoredExtensionAssignment.service";
import { createAdminShellStore } from "../../packages/payload-extension-manager/src/admin-shell/createAdminShellStore.util";
import { hashAdminShellPolicy } from "../../packages/payload-extension-manager/src/admin-shell/hashAdminShellPolicy.server";
import { prepareAdminShell } from "../../packages/payload-extension-manager/src/admin-shell/prepareAdminShell.service";
import { previewAdminShell } from "../../packages/payload-extension-manager/src/admin-shell/previewAdminShell.service";
import { applyAdminShell } from "../../packages/payload-extension-manager/src/admin-shell/applyAdminShell.service";
import { readAdminShellState } from "../../packages/payload-extension-manager/src/admin-shell/readAdminShellState.service";
import { mapExtensionError } from "../../packages/payload-extension-manager/src/server/mapExtensionError.mapper";
import { ExtensionManagerService } from "../../packages/payload-extension-manager/src/server/ExtensionManager.service";
import { readExtensionRuntimeAssignment } from "../../packages/payload-extension-manager/src/server/readExtensionRuntimeAssignment.service";

const repository = vi.hoisted(() => ({ read: vi.fn(), mutate: vi.fn() }));
/** Только persistence заменён boundary mock; catalog, ACL и lifecycle service выполняются буквально. */
vi.mock(
  "../../packages/payload-extension-manager/src/persistence/ExtensionAppearance.repository",
  () => ({
    ExtensionAppearanceRepository: class {
      read = repository.read;
      mutate = repository.mutate;
    },
  }),
);
afterEach(() => vi.resetAllMocks());

const NOW = Date.parse("2026-11-12T10:00:00.000Z");
const ACTOR = "users:17";
const BUILD = "readiness-test-build";
const HOST = {
  contractVersion: "1.0" as const,
  platformVersion: "1.0.0",
  reactVersion: "19.2.8",
  nextVersion: "16.3.1",
};
const POLICY: AdminShellPolicy = {
  enabled: { native: true, template: true },
  defaultMode: "template",
  fallbackMode: "native",
  nativeVersion: "3.88.0",
  nativeRoute: "/admin",
  templateRoute: "/system",
};
function uuid(seed: number) {
  return `00000000-0000-4000-8000-${seed.toString(16).padStart(12, "0")}`;
}
function registrations(
  readiness?: ExtensionTemplateReadiness,
): ExtensionCatalogRegistration[] {
  return [
    {
      manifest,
      settingsSchema,
      resolveSettings: resolveRealizeSettings,
      ...(readiness ? { readiness } : {}),
    },
    {
      manifest: { ...manifest, id: "ready-template" },
      settingsSchema,
      resolveSettings: resolveRealizeSettings,
    },
  ];
}
function catalog(readiness?: ExtensionTemplateReadiness) {
  return createExtensionCatalog({
    entries: registrations(readiness),
    hostCompatibility: HOST,
    runtimeBuildId: BUILD,
  });
}
function selection(templateId = "realize") {
  return {
    templateId,
    templateVersion: "0.1.0",
    target: "admin" as const,
    paletteId: "realize",
    paletteVersion: "0.1.0",
    mode: "light" as const,
  };
}
function assignment(runtime: ExtensionCatalog, templateId = "realize") {
  return resolveExtensionAssignment({
    catalog: runtime,
    target: "admin",
    selection: selection(templateId),
    settings: {},
  });
}
function prepare(runtime: ExtensionCatalog) {
  return prepareExtensionAppearance({
    store: createExtensionAppearanceStore(),
    catalog: runtime,
    actorKey: ACTOR,
    requestId: uuid(1),
    planId: uuid(2),
    nowMs: NOW,
    input: {
      action: "assign",
      target: "admin",
      expectedRevision: 0,
      expectedCatalogHash: runtime.catalogHash,
      selection: selection(),
      settings: {},
    },
  });
}
function applyInput(plan: { planId: string; planHash: string }) {
  return { planId: plan.planId, expectedPlanHash: plan.planHash };
}
function inventory(runtime: ExtensionCatalog): InstalledTemplatesLoaderContext {
  return {
    catalog: runtime,
    store: createExtensionAppearanceStore(),
    bootstrapStore: createExtensionAppearanceStore(),
    policy: POLICY,
    selectedShellMode: "native",
    shellMode: "native",
    assignmentByTarget: { admin: null, frontend: null },
    requiresRecovery: [],
    runtime: {
      schemaVersion: "1.0",
      buildId: BUILD,
      catalogHash: runtime.catalogHash,
      sourceVersion: "1.0.0",
      builtAt: new Date(NOW - 1000).toISOString(),
    },
    storageReady: true,
    manageAppearance: true,
    observedAt: new Date(NOW).toISOString(),
  };
}
function mainEntry(input: InstalledTemplatesLoaderContext) {
  return mapInstalledTemplatesSnapshot(input).entries.find(
    (entry) => entry.id === "realize",
  )!;
}

// Все stores ниже — pure fixtures. Тесты не утверждают наличие пакета в production или атомарность БД.
describe("host-owned template readiness", () => {
  it("preserves the legacy catalog hash and manifest identity while binding explicit admission to the catalog hash", () => {
    const legacy = catalog();
    const ready = catalog("ready");
    const preview = catalog("preview-only");
    expect(legacy.catalogHash).toBe(
      hashExtensionValue({
        schemaVersion: "1.0",
        hostCompatibility: HOST,
        runtimeBuildId: BUILD,
        entries: legacy.entries.map((entry) => ({
          manifest: entry.manifest,
          settingsSchema: entry.settingsSchema,
        })),
      }),
    );
    expect(preview.catalogHash).not.toBe(legacy.catalogHash);
    expect(preview.catalogHash).not.toBe(ready.catalogHash);
    expect(preview.entries.map((entry) => entry.manifestHash)).toEqual(
      legacy.entries.map((entry) => entry.manifestHash),
    );
    const dto = mapExtensionCatalog(preview);
    expect(
      dto.entries.find((entry) => entry.manifest.id === "realize")?.readiness,
    ).toBe("preview-only");
    expect(extensionCatalogDtoSchema.safeParse(dto).success).toBe(true);
    expect(() =>
      createExtensionCatalog({
        entries: [
          {
            ...registrations()[0],
            readiness: "anything" as ExtensionTemplateReadiness,
          },
        ],
        hostCompatibility: HOST,
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CATALOG" }));
    expect(
      extensionCatalogDtoSchema.safeParse({
        ...dto,
        entries: [{ ...dto.entries[0], readiness: "anything" }],
      }).success,
    ).toBe(false);
  });

  it("allows settings validation, preparation and actor-bound preview but rejects activation without mutation", () => {
    const runtime = catalog("preview-only");
    const prepared = prepare(runtime);
    const before = structuredClone(prepared.store);
    expect(prepared.plan.readiness).toBe("preview-only");
    expect(
      extensionAppearancePlanDtoSchema.safeParse(prepared.plan).success,
    ).toBe(true);
    expect(prepared.store.plans[0]).not.toHaveProperty("readiness");
    expect(prepared.store.receipts[0]).not.toHaveProperty("readiness");
    const preview = previewExtensionAppearance({
      store: prepared.store,
      catalog: runtime,
      actorKey: ACTOR,
      planId: prepared.plan.planId,
      nowMs: NOW,
    });
    expect(preview.readiness).toBe("preview-only");
    expect(() =>
      previewExtensionAppearance({
        store: prepared.store,
        catalog: runtime,
        actorKey: "users:18",
        planId: prepared.plan.planId,
        nowMs: NOW,
      }),
    ).toThrowError(expect.objectContaining({ code: "PLAN_ACTOR_MISMATCH" }));
    let failure: unknown;
    try {
      applyExtensionAppearance({
        store: prepared.store,
        catalog: runtime,
        actorKey: ACTOR,
        requestId: uuid(3),
        input: applyInput(prepared.plan),
        nowMs: NOW,
      });
    } catch (error) {
      failure = error;
    }
    expect(mapExtensionError(failure)).toMatchObject({
      status: 409,
      error: { code: "TEMPLATE_PREVIEW_ONLY" },
    });
    expect(prepared.store).toEqual(before);
  });

  it("replays successful apply receipts before catalog and readiness admission; pending plans become stale", () => {
    const ready = catalog();
    const preview = catalog("preview-only");
    const prepared = prepare(ready);
    const input = applyInput(prepared.plan);
    const applied = applyExtensionAppearance({
      store: prepared.store,
      catalog: ready,
      actorKey: ACTOR,
      requestId: uuid(3),
      input,
      nowMs: NOW,
    });
    const replayed = applyExtensionAppearance({
      store: applied.store,
      catalog: preview,
      actorKey: ACTOR,
      requestId: uuid(3),
      input,
      nowMs: NOW + 86_400_000,
    });
    expect(replayed.replayed).toBe(true);
    expect(replayed.receipt).toEqual(applied.receipt);
    expect(replayed.store).toEqual(applied.store);
    expect(() =>
      applyExtensionAppearance({
        store: prepared.store,
        catalog: preview,
        actorKey: ACTOR,
        requestId: uuid(4),
        input,
        nowMs: NOW,
      }),
    ).toThrowError(expect.objectContaining({ code: "CATALOG_CHANGED" }));
    const replayedPrepare = prepareExtensionAppearance({
      store: prepared.store,
      catalog: preview,
      actorKey: ACTOR,
      requestId: uuid(1),
      planId: uuid(9),
      nowMs: NOW,
      input: {
        action: "assign",
        target: "admin",
        expectedRevision: 0,
        expectedCatalogHash: ready.catalogHash,
        selection: selection(),
        settings: {},
      },
    });
    expect(replayedPrepare.replayed).toBe(true);
    expect(replayedPrepare.plan).toEqual({
      ...prepared.plan,
      readiness: "preview-only",
    });
    expect(replayedPrepare.store).toEqual(prepared.store);
  });

  it("keeps service reads and known-receipt replay available when a bootstrap default becomes preview-only", async () => {
    const ready = catalog();
    const prepared = prepare(ready);
    const input = applyInput(prepared.plan);
    const applied = applyExtensionAppearance({
      store: prepared.store,
      catalog: ready,
      actorKey: ACTOR,
      requestId: uuid(3),
      input,
      nowMs: NOW,
    });
    let stored = applied.store;
    repository.read.mockImplementation(async () => ({
      store: stored,
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
        expect(bootstrap.targets.admin.current).toBeNull();
        const next = await operation(stored);
        stored = next.store;
        return next.result;
      },
    );
    const options = {
      userCollection: "users",
      scopeKey: "fixture",
      apiRoute: "/extensions",
      catalog: registrations("preview-only"),
      hostCompatibility: HOST,
      runtimeBuildId: async () => BUILD,
      defaultAdmin: { selection: selection(), settings: {} },
      access: {
        canReadCatalog: () => true,
        canManageAppearance: () => true,
        canInstallCode: () => false,
      },
    };
    const req = {
      user: { id: 17, collection: "users" },
      payload: {},
    } as unknown as PayloadRequest;
    const service = new ExtensionManagerService(req, options);
    const snapshot = await service.snapshot();
    expect(
      snapshot.catalog.entries.find((entry) => entry.manifest.id === "realize")
        ?.readiness,
    ).toBe("preview-only");
    // Raw pointer остаётся видимым для восстановления; runtime reader не допускает его исполнения.
    expect(snapshot.targets.admin.current).toEqual(applied.receipt.assignment);
    await expect(
      readExtensionRuntimeAssignment(req.payload, options, "admin"),
    ).resolves.toMatchObject({ assignment: null, requiresRecovery: true });
    await expect(service.apply(input, uuid(3))).resolves.toEqual({
      receipt: applied.receipt,
      replayed: true,
    });
    expect(stored).toEqual(applied.store);
    const candidate = await service.prepare(
      {
        action: "assign",
        target: "admin",
        expectedRevision: 1,
        expectedCatalogHash: catalog("preview-only").catalogHash,
        selection: selection(),
        settings: {},
      },
      uuid(4),
    );
    expect(candidate.plan.readiness).toBe("preview-only");
    await expect(service.preview(candidate.plan.planId)).resolves.toMatchObject(
      { readiness: "preview-only" },
    );
    const before = structuredClone(stored);
    await expect(
      service.apply(applyInput(candidate.plan), uuid(5)),
    ).rejects.toMatchObject({ code: "TEMPLATE_PREVIEW_ONLY" });
    expect(stored).toEqual(before);
  });

  it("rejects recovery to preview-only with the same admission as assignment", () => {
    const runtime = catalog("preview-only");
    const store = createExtensionAppearanceStore({
      admin: assignment(runtime, "ready-template"),
    });
    store.targets.admin.previous = assignment(runtime);
    const prepared = prepareExtensionAppearance({
      store,
      catalog: runtime,
      actorKey: ACTOR,
      requestId: uuid(20),
      planId: uuid(21),
      nowMs: NOW,
      input: {
        action: "recover",
        target: "admin",
        expectedRevision: 0,
        expectedCatalogHash: runtime.catalogHash,
      },
    });
    expect(
      previewExtensionAppearance({
        store: prepared.store,
        catalog: runtime,
        actorKey: ACTOR,
        planId: prepared.plan.planId,
        nowMs: NOW,
      }).readiness,
    ).toBe("preview-only");
    expect(() =>
      applyExtensionAppearance({
        store: prepared.store,
        catalog: runtime,
        actorKey: ACTOR,
        requestId: uuid(22),
        input: applyInput(prepared.plan),
        nowMs: NOW,
      }),
    ).toThrowError(expect.objectContaining({ code: "TEMPLATE_PREVIEW_ONLY" }));
    expect(prepared.store.targets.admin).toEqual(store.targets.admin);
  });

  it("keeps absent and explicit ready policies executable", () => {
    for (const readiness of [undefined, "ready"] as const) {
      const runtime = catalog(readiness);
      const prepared = prepare(runtime);
      expect(
        applyExtensionAppearance({
          store: prepared.store,
          catalog: runtime,
          actorKey: ACTOR,
          requestId: uuid(3),
          input: applyInput(prepared.plan),
          nowMs: NOW,
        }).store.targets.admin.current,
      ).toEqual(assignment(runtime));
    }
  });

  it("prevents bootstrap, stored current and fallback pointers from executing preview-only entries", async () => {
    const runtime = catalog("preview-only");
    const candidate = assignment(runtime);
    const fallback = assignment(runtime, "ready-template");
    expect(
      resolveStoredExtensionAssignment({
        catalog: runtime,
        target: "admin",
        current: candidate,
        fallback,
      }),
    ).toEqual({ assignment: fallback, requiresRecovery: true });
    expect(
      resolveStoredExtensionAssignment({
        catalog: runtime,
        target: "admin",
        current: candidate,
        fallback: candidate,
      }),
    ).toEqual({ assignment: null, requiresRecovery: true });
    expect(
      resolveStoredExtensionAssignment({
        catalog: runtime,
        target: "admin",
        current: fallback,
        fallback: candidate,
      }),
    ).toEqual({ assignment: fallback, requiresRecovery: false });
    const access = {
      canReadCatalog: () => true,
      canManageAppearance: () => true,
      canInstallCode: () => false,
    };
    await expect(
      createExtensionRuntimeState({
        userCollection: "users",
        scopeKey: "fixture",
        apiRoute: "/extensions",
        catalog: registrations("preview-only"),
        hostCompatibility: HOST,
        defaultAdmin: { selection: selection(), settings: {} },
        access,
      }),
    ).resolves.toMatchObject({
      bootstrapStore: { targets: { admin: { current: null } } },
    });
    const ready = await createExtensionRuntimeState({
      userCollection: "users",
      scopeKey: "fixture",
      apiRoute: "/extensions",
      catalog: registrations(),
      hostCompatibility: HOST,
      defaultAdmin: { selection: selection(), settings: {} },
      access,
    });
    expect(
      ready.bootstrapStore.targets.admin.current?.selection.templateId,
    ).toBe("realize");
  });

  it("prevents the admin-shell path from making a stored preview-only assignment effective while retaining native fallback", () => {
    const runtime = catalog("preview-only");
    const appearance = {
      catalog: runtime,
      store: createExtensionAppearanceStore({ admin: assignment(runtime) }),
    };
    const shell = createAdminShellStore(POLICY);
    expect(
      readAdminShellState({ store: shell, policy: POLICY, appearance }),
    ).toMatchObject({
      effectiveMode: "native",
      requiresRecovery: true,
      fallbackReason: "template_unavailable",
    });
    const context = {
      store: shell,
      policy: POLICY,
      appearance,
      actorKey: ACTOR,
      nowMs: NOW,
    };
    const input = {
      action: "select",
      mode: "template",
      expectedRevision: 0,
      expectedPolicyHash: hashAdminShellPolicy(POLICY),
    };
    expect(() =>
      prepareAdminShell({
        ...context,
        input,
        requestId: uuid(5),
        planId: uuid(6),
      }),
    ).toThrowError(expect.objectContaining({ code: "SHELL_UNAVAILABLE" }));
    const native = prepareAdminShell({
      ...context,
      input: { ...input, mode: "native" },
      requestId: uuid(7),
      planId: uuid(8),
    });
    expect(
      applyAdminShell({
        ...context,
        store: native.store,
        input: applyInput(native.plan),
        requestId: uuid(9),
      }).receipt.mode,
    ).toBe("native");
    const readyCatalog = catalog("ready");
    const readyAppearance = { ...appearance, catalog: readyCatalog };
    const prepared = prepareAdminShell({
      ...context,
      appearance: readyAppearance,
      input,
      requestId: uuid(10),
      planId: uuid(11),
    });
    expect(prepared.plan.readiness).toBe("ready");
    expect(adminShellPlanDtoSchema.safeParse(prepared.plan).success).toBe(true);
    expect(prepared.store.plans[0]).not.toHaveProperty("readiness");
    expect(
      previewAdminShell({
        ...context,
        appearance: readyAppearance,
        store: prepared.store,
        planId: prepared.plan.planId,
      }).readiness,
    ).toBe("ready");
    expect(() =>
      applyAdminShell({
        ...context,
        store: prepared.store,
        input: applyInput(prepared.plan),
        requestId: uuid(12),
      }),
    ).toThrowError(expect.objectContaining({ code: "SHELL_UNAVAILABLE" }));
  });

  it("keeps preview-only settings available, disables selection and prevents a stale stored pointer from claiming activity", () => {
    const runtime = catalog("preview-only");
    const input = inventory(runtime);
    const entry = mainEntry(input);
    expect(entry).toMatchObject({
      readiness: "preview-only",
      installation: "confirmed",
      availability: "available",
      actions: { settings: true, select: false, reason: "preview_only" },
    });
    expect(
      installedTemplatesSnapshotSchema.safeParse(
        mapInstalledTemplatesSnapshot(input),
      ).success,
    ).toBe(true);
    input.store = createExtensionAppearanceStore({
      admin: assignment(runtime),
    });
    input.assignmentByTarget.admin = assignment(runtime);
    input.shellMode = "template";
    const snapshot = mapInstalledTemplatesSnapshot(input);
    expect(
      snapshot.entries.find((item) => item.id === "realize")?.usage,
    ).toMatchObject({ selectedTargets: ["admin"], activeTargets: [] });
    expect(snapshot.unavailableAssignments).toEqual([
      {
        target: "admin",
        templateId: "realize",
        templateVersion: "0.1.0",
        reason: "invalid_assignment",
      },
    ]);
    expect(
      installedTemplatesSnapshotSchema.safeParse({
        ...snapshot,
        entries: snapshot.entries.map((item) =>
          item.id === "realize"
            ? {
                ...item,
                actions: { settings: true, select: true, reason: null },
              }
            : item,
        ),
      }).success,
    ).toBe(false);
  });

  it.each([
    ["read_only", { manageAppearance: false }],
    ["requires_schema", { storageReady: false }],
    ["runtime_unverified", { runtime: null }],
    [
      "unavailable",
      { policy: { ...POLICY, enabled: { native: true, template: false } } },
    ],
  ])("retains %s gates ahead of preview-only actions", (reason, patch) => {
    expect(
      mainEntry({ ...inventory(catalog("preview-only")), ...patch }),
    ).toMatchObject({ actions: { settings: false, select: false, reason } });
  });
});
