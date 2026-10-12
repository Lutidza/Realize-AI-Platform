/**
 * @file tests/int/extension-appearance.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет чистый appearance lifecycle, DTO, CAS и UUID replay без утверждения DB atomicity.
 * @see documentation/specifications/extension-management.md
 */
import { describe, expect, it } from "vitest";
import type {
  TemplateSettings,
  TemplateTarget,
} from "@realize/template-contracts";
import realizeManifest from "@realize/template-realize/manifest.json";
import realizeSettingsSchema from "@realize/template-realize/settings.schema.json";
import { resolveRealizeSettings } from "@realize/template-realize/settings";
import {
  ExtensionManagerError,
  extensionAppearancePlanDtoSchema,
  extensionAppearanceReceiptDtoSchema,
  extensionCatalogDtoSchema,
  mapExtensionCatalog,
  type ExtensionAppearanceStore,
  type ExtensionCatalog,
  type ExtensionCatalogRegistration,
  type ExtensionManagerErrorCode,
  type PrepareExtensionAppearanceResult,
} from "../../packages/payload-extension-manager/src/extensionManagerContracts.index";
import {
  applyExtensionAppearance,
  createExtensionAppearanceStore,
  createExtensionCatalog,
  hashExtensionValue,
  parseExtensionAppearanceStore,
  prepareExtensionAppearance,
  previewExtensionAppearance,
  resolveExtensionAssignment,
} from "../../packages/payload-extension-manager/src/appearance/extensionAppearance.server.index";

const NOW = Date.parse("2026-10-12T12:00:00.000Z");
const ACTOR = "users:17";
const HOST = {
  contractVersion: "1.0",
  platformVersion: "1.0.0",
  reactVersion: "19.2.8",
  nextVersion: "16.3.1",
};

function uuid(seed: number) {
  return `00000000-0000-4000-8000-${seed.toString(16).padStart(12, "0")}`;
}

/** Frontend запись здесь — только fixture общего протокола, не production renderer. */
function registrations(): ExtensionCatalogRegistration[] {
  return [
    {
      manifest: realizeManifest,
      settingsSchema: realizeSettingsSchema,
      resolveSettings: resolveRealizeSettings,
    },
    {
      manifest: {
        ...realizeManifest,
        id: "fixture-front",
        packageName: "@fixtures/template-front",
        entries: { frontend: "./frontend" },
        targets: [{ target: "frontend", screens: ["page"] }],
      },
      settingsSchema: realizeSettingsSchema,
      resolveSettings: resolveRealizeSettings,
    },
  ];
}

function catalog() {
  return createExtensionCatalog({
    entries: registrations(),
    hostCompatibility: HOST,
  });
}

function selection(target: TemplateTarget = "admin") {
  return {
    templateId: target === "admin" ? "realize" : "fixture-front",
    templateVersion: "0.1.0",
    target,
    paletteId: "realize",
    paletteVersion: "0.1.0",
    mode: "light" as const,
  };
}

function command(
  store: ExtensionAppearanceStore,
  runtime: ExtensionCatalog,
  settings: TemplateSettings = {},
  target: TemplateTarget = "admin",
) {
  return {
    action: "assign" as const,
    target,
    expectedRevision: store.targets[target].revision,
    expectedCatalogHash: runtime.catalogHash,
    selection: selection(target),
    settings,
  };
}

function prepare(
  store: ExtensionAppearanceStore,
  runtime: ExtensionCatalog,
  seed: number,
  settings: TemplateSettings = {},
  target: TemplateTarget = "admin",
) {
  return prepareExtensionAppearance({
    store,
    catalog: runtime,
    actorKey: ACTOR,
    requestId: uuid(seed),
    planId: uuid(seed + 1000),
    input: command(store, runtime, settings, target),
    nowMs: NOW,
  });
}

function apply(
  prepared: PrepareExtensionAppearanceResult,
  runtime: ExtensionCatalog,
  seed: number,
  nowMs = NOW + 1000,
) {
  return applyExtensionAppearance({
    store: prepared.store,
    catalog: runtime,
    actorKey: ACTOR,
    requestId: uuid(seed),
    input: {
      planId: prepared.plan.planId,
      expectedPlanHash: prepared.plan.planHash,
    },
    nowMs,
  });
}

function expectCode(operation: () => unknown, code: ExtensionManagerErrorCode) {
  let caught: unknown;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ExtensionManagerError);
  expect(caught).toMatchObject({ code });
}

describe("compiled appearance catalog and strict DTO", () => {
  it("hashes canonical manifest/schema/host/build metadata and ignores registry ordering", () => {
    const baseline = catalog();
    const reversed = createExtensionCatalog({
      entries: registrations().reverse(),
      hostCompatibility: HOST,
    });
    expect(reversed.catalogHash).toBe(baseline.catalogHash);
    const changedSchema = registrations();
    changedSchema[0].settingsSchema = {
      ...realizeSettingsSchema,
      title: "Changed schema",
    };
    expect(
      createExtensionCatalog({
        entries: changedSchema,
        hostCompatibility: HOST,
      }).catalogHash,
    ).not.toBe(baseline.catalogHash);
    expect(
      createExtensionCatalog({
        entries: registrations(),
        hostCompatibility: { ...HOST, platformVersion: "1.0.1" },
      }).catalogHash,
    ).not.toBe(baseline.catalogHash);
    expect(
      createExtensionCatalog({
        entries: registrations(),
        hostCompatibility: HOST,
        runtimeBuildId: "build_42",
      }).catalogHash,
    ).not.toBe(baseline.catalogHash);
    const dto = mapExtensionCatalog(baseline);
    expect(extensionCatalogDtoSchema.safeParse(dto).success).toBe(true);
    expect(dto.entries[0]).not.toHaveProperty("resolveSettings");
    expect(
      extensionCatalogDtoSchema.safeParse({ ...dto, execute: "npm install" })
        .success,
    ).toBe(false);
    dto.entries[0].manifest.displayName = "Mutated DTO";
    expect(baseline.entries[0].manifest.displayName).not.toBe("Mutated DTO");
  });

  it("refuses duplicate identities, malformed schemas and untrusted host metadata", () => {
    const entries = registrations();
    expectCode(
      () =>
        createExtensionCatalog({
          entries: [entries[0], entries[0]],
          hostCompatibility: HOST,
        }),
      "INVALID_CATALOG",
    );
    expectCode(
      () =>
        createExtensionCatalog({
          entries: [{ ...entries[0], settingsSchema: { type: "array" } }],
          hostCompatibility: HOST,
        }),
      "INVALID_CATALOG",
    );
    expectCode(
      () =>
        createExtensionCatalog({
          entries,
          hostCompatibility: { ...HOST, command: "install" },
        }),
      "INVALID_CATALOG",
    );
  });

  it.each([
    ["unknown field", { serverActor: ACTOR }],
    ["negative revision", { expectedRevision: -1 }],
    [
      "mutable version",
      { selection: { ...selection(), templateVersion: "latest" } },
    ],
    ["target mismatch", { target: "frontend" }],
    ["malformed hash", { expectedCatalogHash: "anything" }],
    ["non-JSON setting", { settings: { panelWidth: Number.NaN } }],
  ])("refuses malformed command: %s", (_label, patch) => {
    const runtime = catalog();
    const store = createExtensionAppearanceStore();
    expectCode(
      () =>
        prepareExtensionAppearance({
          store,
          catalog: runtime,
          actorKey: ACTOR,
          requestId: uuid(1),
          planId: uuid(2),
          input: { ...command(store, runtime), ...patch },
          nowMs: NOW,
        }),
      "INVALID_INPUT",
    );
  });

  it("refuses unsafe JSON settings without reading accessors or allowing package exceptions through", () => {
    const runtime = catalog();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    let getterRead = false;
    const getter = Object.defineProperty({}, "density", {
      enumerable: true,
      get() {
        getterRead = true;
        return "compact";
      },
    });
    const unsafe = [
      cyclic,
      getter,
      { panelWidth: BigInt(280) },
      JSON.parse('{"__proto__":{"polluted":true}}'),
    ];
    for (const settings of unsafe)
      expectCode(
        () =>
          resolveExtensionAssignment({
            catalog: runtime,
            target: "admin",
            selection: selection(),
            settings,
          }),
        "INVALID_SETTINGS",
      );
    expect(getterRead).toBe(false);
    for (const settings of [
      { panelWidth: 219 },
      { panelWidth: 280.5 },
      { density: "tiny" },
      { secret: "private" },
    ])
      expectCode(
        () =>
          resolveExtensionAssignment({
            catalog: runtime,
            target: "admin",
            selection: selection(),
            settings,
          }),
        "INVALID_SETTINGS",
      );
    const throwingEntries = registrations();
    throwingEntries[0].resolveSettings = () => {
      throw new Error("private exception material");
    };
    const throwingCatalog = createExtensionCatalog({
      entries: throwingEntries,
      hostCompatibility: HOST,
    });
    try {
      resolveExtensionAssignment({
        catalog: throwingCatalog,
        target: "admin",
        selection: selection(),
        settings: {},
      });
    } catch (error) {
      expect(String(error)).not.toContain("private exception material");
      expect(error).toMatchObject({ code: "INVALID_SETTINGS", status: 400 });
    }
  });

  it("allows only exact compiled target/version/palette/mode assignments", () => {
    const runtime = catalog();
    for (const candidate of [
      { ...selection(), templateVersion: "0.2.0" },
      { ...selection(), paletteVersion: "0.2.0" },
      { ...selection(), mode: "system" },
    ])
      expectCode(
        () =>
          resolveExtensionAssignment({
            catalog: runtime,
            target: "admin",
            selection: candidate,
            settings: {},
          }),
        "ASSIGNMENT_UNAVAILABLE",
      );
  });

  it("validates success DTO allowlists and refuses private fields or mismatched target", () => {
    const runtime = catalog();
    const prepared = prepare(createExtensionAppearanceStore(), runtime, 1);
    expect(
      extensionAppearancePlanDtoSchema.safeParse(prepared.plan).success,
    ).toBe(true);
    expect(
      extensionAppearancePlanDtoSchema.safeParse({
        ...prepared.plan,
        actorKey: ACTOR,
      }).success,
    ).toBe(false);
    expect(
      extensionAppearancePlanDtoSchema.safeParse({
        ...prepared.plan,
        target: "frontend",
      }).success,
    ).toBe(false);
    const applied = apply(prepared, runtime, 2);
    expect(
      extensionAppearanceReceiptDtoSchema.safeParse(applied.receipt).success,
    ).toBe(true);
    expect(
      extensionAppearanceReceiptDtoSchema.safeParse({
        ...applied.receipt,
        requestId: uuid(2),
      }).success,
    ).toBe(false);
    expect(
      extensionAppearanceReceiptDtoSchema.safeParse({
        ...applied.receipt,
        target: "frontend",
      }).success,
    ).toBe(false);
  });

  it("requires canonical UUID/server context and rejects command accessors without evaluating them", () => {
    const runtime = catalog();
    const store = createExtensionAppearanceStore();
    const base = {
      store,
      catalog: runtime,
      actorKey: ACTOR,
      requestId: uuid(1),
      planId: uuid(1001),
      input: command(store, runtime),
      nowMs: NOW,
    };
    for (const patch of [
      { requestId: "00000000-0000-4000-8000-00000000000A" },
      { requestId: "arbitrary-key" },
      { planId: "arbitrary-key" },
      { actorKey: "../users:17" },
      { nowMs: Number.POSITIVE_INFINITY },
      { nowMs: -1 },
      { ttlMs: 0 },
      { ttlMs: 31 * 60 * 1000 },
    ])
      expectCode(
        () => prepareExtensionAppearance({ ...base, ...patch }),
        "INVALID_INPUT",
      );
    let read = false;
    const accessor = Object.defineProperty({ ...base.input }, "target", {
      enumerable: true,
      get() {
        read = true;
        throw new Error("must not read");
      },
    });
    expectCode(
      () => prepareExtensionAppearance({ ...base, input: accessor }),
      "INVALID_INPUT",
    );
    expect(read).toBe(false);
  });
});

describe("appearance prepare/preview/apply independent target lifecycle", () => {
  it("prepares without mutating either target and returns independent public snapshots", () => {
    const runtime = catalog();
    const original = createExtensionAppearanceStore();
    const snapshot = structuredClone(original);
    const prepared = prepare(original, runtime, 1, { density: "compact" });
    expect(original).toEqual(snapshot);
    expect(prepared.store.targets).toEqual(snapshot.targets);
    expect(prepared.plan.desiredAssignment.settings).toEqual({
      density: "compact",
      panelWidth: 280,
    });
    expect(prepared.plan).not.toHaveProperty("actorKey");
    expect(prepared.plan).not.toHaveProperty("requestId");
    expect(prepared.plan).not.toHaveProperty("inputFingerprint");
    prepared.plan.desiredAssignment.settings.panelWidth = 300;
    expect(prepared.store.plans[0].desiredAssignment.settings.panelWidth).toBe(
      280,
    );
    const pendingSnapshot = structuredClone(prepared.store);
    const preview = previewExtensionAppearance({
      store: prepared.store,
      catalog: runtime,
      actorKey: ACTOR,
      planId: prepared.plan.planId,
      nowMs: NOW + 1,
    });
    expect(preview.desiredAssignment.settings.panelWidth).toBe(280);
    expect(prepared.store).toEqual(pendingSnapshot);
  });

  it("increments only the selected target and retains previous exact assignment", () => {
    const runtime = catalog();
    const previous = resolveExtensionAssignment({
      catalog: runtime,
      target: "admin",
      selection: selection(),
      settings: {},
    });
    const original = createExtensionAppearanceStore({ admin: previous });
    const prepared = prepare(original, runtime, 1, {
      density: "compact",
      panelWidth: 320,
    });
    const applied = apply(prepared, runtime, 2);
    expect(applied.store.targets.admin).toEqual({
      revision: 1,
      current: applied.receipt.assignment,
      previous,
    });
    expect(applied.store.targets.frontend).toEqual(original.targets.frontend);
    expect(applied.store.plans).toEqual([]);
    expect(applied.receipt.appliedRevision).toBe(1);
    applied.receipt.assignment.settings.panelWidth = 360;
    expect(applied.store.targets.admin.current?.settings.panelWidth).toBe(320);
  });

  it("rejects another actor, expiry, catalog drift and changed base without any mutation", () => {
    const runtime = catalog();
    const prepared = prepare(createExtensionAppearanceStore(), runtime, 1);
    const snapshot = structuredClone(prepared.store);
    const base = {
      store: prepared.store,
      catalog: runtime,
      actorKey: ACTOR,
      planId: prepared.plan.planId,
      nowMs: NOW + 1,
    };
    expectCode(
      () => previewExtensionAppearance({ ...base, actorKey: "users:18" }),
      "PLAN_ACTOR_MISMATCH",
    );
    expectCode(
      () =>
        previewExtensionAppearance({
          ...base,
          nowMs: Date.parse(prepared.plan.expiresAt),
        }),
      "PLAN_EXPIRED",
    );
    const drifted = createExtensionCatalog({
      entries: registrations(),
      hostCompatibility: HOST,
      runtimeBuildId: "new_build",
    });
    expectCode(
      () => previewExtensionAppearance({ ...base, catalog: drifted }),
      "CATALOG_CHANGED",
    );
    const changed = structuredClone(prepared.store);
    changed.targets.admin.current = prepared.plan.desiredAssignment;
    expectCode(
      () => previewExtensionAppearance({ ...base, store: changed }),
      "STATE_CHANGED",
    );
    expect(prepared.store).toEqual(snapshot);
  });

  it("rejects a wrong immutable plan hash and a cross-actor apply", () => {
    const runtime = catalog();
    const prepared = prepare(createExtensionAppearanceStore(), runtime, 1);
    const base = {
      store: prepared.store,
      catalog: runtime,
      actorKey: ACTOR,
      requestId: uuid(2),
      input: {
        planId: prepared.plan.planId,
        expectedPlanHash: prepared.plan.planHash,
      },
      nowMs: NOW + 1,
    };
    expectCode(
      () =>
        applyExtensionAppearance({
          ...base,
          input: { ...base.input, expectedPlanHash: "0".repeat(64) },
        }),
      "PLAN_HASH_MISMATCH",
    );
    expectCode(
      () => applyExtensionAppearance({ ...base, actorKey: "users:18" }),
      "PLAN_ACTOR_MISMATCH",
    );
  });

  it("models competing plans against one revision and rejects the second after the first mutation", () => {
    const runtime = catalog();
    const first = prepare(createExtensionAppearanceStore(), runtime, 1, {
      panelWidth: 300,
    });
    const second = prepare(first.store, runtime, 2, { panelWidth: 320 });
    const appliedFirst = apply({ ...first, store: second.store }, runtime, 3);
    expectCode(
      () => apply({ ...second, store: appliedFirst.store }, runtime, 4),
      "REVISION_CONFLICT",
    );
    expect(appliedFirst.store.targets.admin.revision).toBe(1);
    expect(appliedFirst.store.targets.admin.current?.settings.panelWidth).toBe(
      300,
    );
  });

  it("allows Admin and frontend plans from the same snapshot to advance independently", () => {
    const runtime = catalog();
    const admin = prepare(createExtensionAppearanceStore(), runtime, 1);
    const frontend = prepare(
      admin.store,
      runtime,
      2,
      { density: "compact" },
      "frontend",
    );
    const appliedAdmin = apply({ ...admin, store: frontend.store }, runtime, 3);
    const appliedFrontend = apply(
      { ...frontend, store: appliedAdmin.store },
      runtime,
      4,
    );
    expect(appliedFrontend.store.targets.admin.revision).toBe(1);
    expect(appliedFrontend.store.targets.frontend.revision).toBe(1);
    expect(appliedFrontend.store.targets.admin.current).toEqual(
      appliedAdmin.store.targets.admin.current,
    );
  });

  it("recovers the exact previous assignment through the same revision validation", () => {
    const runtime = catalog();
    const previous = resolveExtensionAssignment({
      catalog: runtime,
      target: "admin",
      selection: selection(),
      settings: { panelWidth: 260 },
    });
    const assigned = apply(
      prepare(createExtensionAppearanceStore({ admin: previous }), runtime, 1, {
        panelWidth: 320,
      }),
      runtime,
      2,
    );
    const recovering = prepareExtensionAppearance({
      store: assigned.store,
      catalog: runtime,
      actorKey: ACTOR,
      requestId: uuid(3),
      planId: uuid(1003),
      input: {
        action: "recover",
        target: "admin",
        expectedRevision: 1,
        expectedCatalogHash: runtime.catalogHash,
      },
      nowMs: NOW + 2000,
    });
    const recovered = apply(recovering, runtime, 4, NOW + 3000);
    expect(recovered.store.targets.admin.current).toEqual(previous);
    expect(recovered.store.targets.admin.previous).toEqual(
      assigned.store.targets.admin.current,
    );
    expect(recovered.store.targets.admin.revision).toBe(2);
    expect(recovered.store.targets.frontend.revision).toBe(0);
  });

  it("refuses recovery without a previous assignment or against a removed compiled version", () => {
    const runtime = catalog();
    const original = createExtensionAppearanceStore();
    const input = {
      action: "recover",
      target: "admin",
      expectedRevision: 0,
      expectedCatalogHash: runtime.catalogHash,
    };
    const base = {
      store: original,
      catalog: runtime,
      actorKey: ACTOR,
      requestId: uuid(1),
      planId: uuid(1001),
      input,
      nowMs: NOW,
    };
    expectCode(
      () => prepareExtensionAppearance(base),
      "NO_PREVIOUS_ASSIGNMENT",
    );
    const unavailable = createExtensionCatalog({
      entries: [],
      hostCompatibility: HOST,
    });
    const store = createExtensionAppearanceStore();
    store.targets.admin.previous = resolveExtensionAssignment({
      catalog: runtime,
      target: "admin",
      selection: selection(),
      settings: {},
    });
    expectCode(
      () =>
        prepareExtensionAppearance({
          ...base,
          store,
          catalog: unavailable,
          input: { ...input, expectedCatalogHash: unavailable.catalogHash },
        }),
      "ASSIGNMENT_UNAVAILABLE",
    );
  });
});

describe("appearance UUID ledger replay and bounded state", () => {
  it("replays the original prepare across plan pruning and ignores a fresh generated plan ID", () => {
    const runtime = catalog();
    const original = createExtensionAppearanceStore();
    const prepared = prepare(original, runtime, 1, { panelWidth: 300 });
    const ledgerInjected = { ...prepared.store, plans: [] };
    const replay = prepareExtensionAppearance({
      store: ledgerInjected,
      catalog: runtime,
      actorKey: ACTOR,
      requestId: uuid(1),
      planId: uuid(999),
      input: command(original, runtime, { panelWidth: 300 }),
      nowMs: NOW + 1000,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.plan).toEqual(prepared.plan);
    expect(replay.store.plans).toEqual([]);
    expectCode(
      () =>
        prepareExtensionAppearance({
          store: ledgerInjected,
          catalog: runtime,
          actorKey: ACTOR,
          requestId: uuid(1),
          planId: uuid(999),
          input: command(original, runtime, { panelWidth: 320 }),
          nowMs: NOW + 1000,
        }),
      "REPLAY_CONFLICT",
    );
    expectCode(
      () =>
        prepareExtensionAppearance({
          store: ledgerInjected,
          catalog: runtime,
          actorKey: ACTOR,
          requestId: uuid(1),
          planId: uuid(999),
          input: command(original, runtime, { panelWidth: 300 }),
          nowMs: Date.parse(prepared.plan.expiresAt),
        }),
      "PLAN_EXPIRED",
    );
  });

  it("isolates prepare UUID keys by actor and namespaces prepare/apply independently", () => {
    const runtime = catalog();
    const original = createExtensionAppearanceStore();
    const first = prepare(original, runtime, 1);
    const otherActor = prepareExtensionAppearance({
      store: first.store,
      catalog: runtime,
      actorKey: "users:18",
      requestId: uuid(1),
      planId: uuid(1002),
      input: command(original, runtime),
      nowMs: NOW,
    });
    expect(otherActor.replayed).toBe(false);
    expect(otherActor.store.plans).toHaveLength(2);
    const applied = apply(first, runtime, 1);
    expect(applied.replayed).toBe(false);
    expect(applied.store.receipts.map((receipt) => receipt.kind)).toEqual([
      "prepare",
      "apply",
    ]);
  });

  it("returns an immutable original apply outcome after expiry/catalog drift and a later revision", () => {
    const runtime = catalog();
    const first = prepare(createExtensionAppearanceStore(), runtime, 1, {
      panelWidth: 260,
    });
    const applied = apply(first, runtime, 2);
    const later = apply(
      prepare(applied.store, runtime, 3, { panelWidth: 320 }),
      runtime,
      4,
    );
    const durableReceipt = applied.store.receipts.find(
      (receipt) => receipt.kind === "apply",
    );
    if (!durableReceipt) throw new Error("Missing fixture apply receipt");
    const ledgerInjected = { ...later.store, receipts: [durableReceipt] };
    const drifted = createExtensionCatalog({
      entries: registrations(),
      hostCompatibility: HOST,
      runtimeBuildId: "new_build",
    });
    const replay = applyExtensionAppearance({
      store: ledgerInjected,
      catalog: drifted,
      actorKey: ACTOR,
      requestId: uuid(2),
      input: {
        planId: first.plan.planId,
        expectedPlanHash: first.plan.planHash,
      },
      nowMs: Date.parse(first.plan.expiresAt) + 1000,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.receipt).toEqual(applied.receipt);
    expect(replay.store.targets.admin.revision).toBe(2);
    expectCode(
      () =>
        applyExtensionAppearance({
          store: ledgerInjected,
          catalog: drifted,
          actorKey: ACTOR,
          requestId: uuid(2),
          input: {
            planId: first.plan.planId,
            expectedPlanHash: "0".repeat(64),
          },
          nowMs: NOW,
        }),
      "REPLAY_CONFLICT",
    );
    expectCode(
      () =>
        applyExtensionAppearance({
          store: ledgerInjected,
          catalog: drifted,
          actorKey: "users:18",
          requestId: uuid(2),
          input: {
            planId: first.plan.planId,
            expectedPlanHash: first.plan.planHash,
          },
          nowMs: NOW,
        }),
      "PLAN_NOT_FOUND",
    );
  });

  it("fails closed when replay ledger is missing instead of applying a stale plan again", () => {
    const runtime = catalog();
    const prepared = prepare(createExtensionAppearanceStore(), runtime, 1);
    const applied = apply(prepared, runtime, 2);
    const purged = { ...applied.store, receipts: [] };
    expectCode(
      () => apply({ ...prepared, store: purged }, runtime, 2),
      "PLAN_NOT_FOUND",
    );
    const stalePlan = { ...purged, plans: prepared.store.plans };
    expectCode(
      () => apply({ ...prepared, store: stalePlan }, runtime, 2),
      "REVISION_CONFLICT",
    );
    expect(stalePlan.targets.admin.revision).toBe(1);
  });

  it("validates immutable plan hashes, strict store identity and opposite-target assignments", () => {
    const runtime = catalog();
    const prepared = prepare(createExtensionAppearanceStore(), runtime, 1);
    const tampered = structuredClone(prepared.store);
    tampered.plans[0].desiredAssignment.settings.panelWidth = 400;
    expectCode(() => parseExtensionAppearanceStore(tampered), "INVALID_STORE");
    expectCode(
      () =>
        parseExtensionAppearanceStore({ ...prepared.store, actorKey: ACTOR }),
      "INVALID_STORE",
    );
    expectCode(
      () =>
        parseExtensionAppearanceStore({
          ...prepared.store,
          plans: [...prepared.store.plans, ...prepared.store.plans],
        }),
      "INVALID_STORE",
    );
    const wrongTarget = createExtensionAppearanceStore();
    wrongTarget.targets.frontend.current = prepared.plan.desiredAssignment;
    expectCode(
      () => parseExtensionAppearanceStore(wrongTarget),
      "INVALID_STORE",
    );
  });

  it("caps pending plans and prunes expired plans while retaining immutable replay receipts", () => {
    const runtime = catalog();
    let store = createExtensionAppearanceStore();
    for (let seed = 1; seed <= 50; seed += 1)
      store = prepare(store, runtime, seed).store;
    expectCode(() => prepare(store, runtime, 51), "LIMIT_REACHED");
    const afterExpiry = prepareExtensionAppearance({
      store,
      catalog: runtime,
      actorKey: ACTOR,
      requestId: uuid(51),
      planId: uuid(1051),
      input: command(store, runtime),
      nowMs: NOW + 16 * 60 * 1000,
    });
    expect(afterExpiry.store.plans).toHaveLength(1);
    expect(afterExpiry.store.receipts).toHaveLength(51);
    expect(afterExpiry.store.targets.admin.revision).toBe(0);
  });

  it("bounds the injected receipt view without evicting replay identities or treating it as a lifetime cap", () => {
    const runtime = catalog();
    const first = prepare(createExtensionAppearanceStore(), runtime, 1);
    const applied = apply(first, runtime, 2);
    const receipt = applied.store.receipts.find(
      (candidate) => candidate.kind === "apply",
    );
    if (!receipt || receipt.kind !== "apply")
      throw new Error("Missing fixture apply receipt");
    const bounded = structuredClone(applied.store);
    bounded.targets.admin.revision = 256;
    bounded.receipts = Array.from({ length: 256 }, (_value, index) => ({
      ...receipt,
      requestId: uuid(2000 + index),
      planId: uuid(3000 + index),
      appliedRevision: index + 1,
    }));
    const snapshot = structuredClone(bounded);
    expectCode(() => prepare(bounded, runtime, 3), "LIMIT_REACHED");
    expect(bounded).toEqual(snapshot);
    const matchingOnly = { ...bounded, receipts: [] };
    const prepared = prepare(matchingOnly, runtime, 3);
    expect(prepared.plan.expectedRevision).toBe(256);
    expect(prepared.store.receipts).toHaveLength(1);
    expectCode(
      () =>
        apply(
          {
            ...prepared,
            store: { ...prepared.store, receipts: bounded.receipts },
          },
          runtime,
          4,
        ),
      "LIMIT_REACHED",
    );
  });

  it("canonical hash refuses non-JSON data and does not execute accessors", () => {
    expect(hashExtensionValue({ z: 1, a: [true, null] })).toBe(
      hashExtensionValue({ a: [true, null], z: 1 }),
    );
    let accessed = false;
    const getter = Object.defineProperty({}, "value", {
      enumerable: true,
      get() {
        accessed = true;
        return 1;
      },
    });
    expectCode(() => hashExtensionValue(getter), "INVALID_INPUT");
    expectCode(() => hashExtensionValue([, 1]), "INVALID_INPUT");
    expectCode(() => hashExtensionValue(new Date(NOW)), "INVALID_INPUT");
    expect(accessed).toBe(false);
  });
});
