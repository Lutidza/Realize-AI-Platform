// @vitest-environment node
/**
 * @file tests/int/extension-layout-binding-reader.int.spec.ts
 * @version 1.0.1
 * @date 2026-11-18
 * @description Проверяет совместимое чтение layout binding без включения нового writer или изменения legacy hashes.
 * @see documentation/specifications/extension-management.md
 */
import { describe, expect, it, vi } from "vitest";
import manifest from "@realize/template-realize/manifest.json";
import settingsSchema from "@realize/template-realize/settings.schema.json";
import { resolveRealizeSettings } from "@realize/template-realize/settings";
import {
  layoutAssignmentBindingSchema,
  parseLayoutAssignmentBinding,
  resolveTemplateLayout,
  type LayoutAssignmentBindingInput,
} from "@realize/template-contracts";
import { createTemplateLayoutCatalog } from "@realize/template-contracts/layouts/server";
import { controlPanelLayoutCatalog } from "@realize/template-realizeai-control-panel/layouts";
import {
  adminShellPlanDtoSchema,
  adminShellReceiptSchema,
  adminShellTemplateBindingSchema,
  applyExtensionAppearanceSchema,
  extensionAppearancePlanDtoSchema,
  extensionAppearanceReceiptDtoSchema,
  extensionAppearanceReceiptSchema,
  extensionAssignmentSchema,
  mapAdminShellPlan,
  mapExtensionAppearancePlan,
  mapExtensionAppearanceReceipt,
  prepareExtensionAppearanceSchema,
  type AdminShellPlan,
  type AdminShellStore,
  type ExtensionAppearancePlan,
  type ExtensionAppearanceStore,
  type ExtensionApplyReceipt,
  type ExtensionPrepareReceipt,
} from "@realize/payload-extension-manager/contracts";
import {
  applyExtensionAppearance,
  createExtensionAppearanceStore,
  createExtensionCatalog,
  extensionAppearanceStateCodec,
  parseAdminShellStore,
  prepareExtensionAppearance,
  resolveExtensionAssignment,
} from "@realize/payload-extension-manager/server";
import { hashExtensionValue } from "../../packages/payload-extension-manager/src/appearance/hashExtensionValue.server";
import { extensionTemplateCatalog } from "../../src/plugins/extensionTemplateCatalog.config";

const actorKey = "users:layout-reader-fixture";
const requestId = "b884bc5d-66af-4ee1-8d36-a1761745bc11";
const applyRequestId = "d0237d3b-9254-42be-959d-067443cc6411";
const planId = "3fc622af-0dc6-43a3-8650-e0ae99aa0111";
const nowMs = Date.parse("2026-11-18T08:00:00.000Z");
const hostCompatibility = {
  contractVersion: "1.0",
  platformVersion: "1.0.0",
  reactVersion: "19.2.8",
  nextVersion: "16.4.5",
};

// Снято реальными pure operations до добавления optional layout reader; это независимые golden значения.
const legacyHashes = {
  catalog: "b46534aa9ff00c331977efdb3a6679b18a35cd5724b8080249648692ff5b8931",
  manifest: "570efab6fc0efe204444023e9486dccbbb842e44222113344a674f51b35e7c45",
  assignment:
    "6a9a1526b4667d3e0359813feaf3348520450e1803c52a8979d4155baf8141d6",
  plan: "9e029a283b554f85cb904ed26dda51bb855f37dc4a7ef120b0c785fed44d6311",
  planDto: "4c5bcd191f909deebb49a4dcd4f4a8e4682ac58d09795dbe3cdbb0659ecbd92c",
  prepareReceipt:
    "fd69a1d0860c361a43cc2b15194be7b4c8f9ac4a5db9ba9d73274828cc16b548",
  applyDto: "8d1785ce96291e76d07d3caa02656216c534f053f55d040dc5d2fdc6434678e7",
  appliedStore:
    "add000a3f20619460fc346aab155d56be9b65013a84c2b8b721e6acb030c979f",
};
const hostCatalogHash =
  "31e93e60a3671440d6618e483593bd7faf5b3205ef8e3c28688b3cda5776636d";

function legacyFixture() {
  const catalog = createExtensionCatalog({
    entries: [
      { manifest, settingsSchema, resolveSettings: resolveRealizeSettings },
    ],
    runtimeBuildId: "layout-reader-legacy-fixture",
    hostCompatibility,
  });
  const selection = {
    templateId: manifest.id,
    templateVersion: manifest.version,
    target: "admin" as const,
    paletteId: manifest.palettes[0].id,
    paletteVersion: manifest.palettes[0].version,
    mode: "light" as const,
  };
  const assignment = resolveExtensionAssignment({
    catalog,
    target: "admin",
    selection,
    settings: {},
  });
  const command = {
    action: "assign" as const,
    target: "admin" as const,
    expectedRevision: 0,
    expectedCatalogHash: catalog.catalogHash,
    selection,
    settings: { density: "compact" },
  };
  const prepared = prepareExtensionAppearance({
    catalog,
    store: createExtensionAppearanceStore({ admin: assignment }),
    actorKey,
    requestId,
    planId,
    nowMs,
    input: command,
  });
  const applied = applyExtensionAppearance({
    catalog,
    store: prepared.store,
    actorKey,
    requestId: applyRequestId,
    nowMs: nowMs + 1000,
    input: { planId, expectedPlanHash: prepared.plan.planHash },
  });
  return { catalog, assignment, command, prepared, applied };
}

function hostCatalog() {
  return createExtensionCatalog({
    // Историческая registration первого reader-среза: новый opt-in catalog здесь ещё не подключён.
    entries: extensionTemplateCatalog.map(
      ({ layouts: _layouts, ...registration }) => registration,
    ),
    runtimeBuildId: "layout-reader-host-fixture",
    hostCompatibility,
  });
}

function controlPanelSelection() {
  return {
    templateId: "realizeai-control-panel",
    templateVersion: "0.1.0",
    target: "admin" as const,
    paletteId: "realizeai-control-panel",
    paletteVersion: "0.1.0",
    mode: "light" as const,
  };
}

function layoutBinding(): LayoutAssignmentBindingInput {
  const catalog = createTemplateLayoutCatalog(controlPanelLayoutCatalog);
  const selected = resolveTemplateLayout(catalog, "without-topbar");
  return {
    schemaVersion: "1.0",
    localId: selected.localId,
    reference: {
      identity: { ...selected.reference.identity },
      version: selected.reference.version,
    },
    catalogHash: catalog.catalogHash,
  };
}

function boundAssignment(explicit = true) {
  const assignment = resolveExtensionAssignment({
    catalog: hostCatalog(),
    target: "admin",
    selection: controlPanelSelection(),
    settings: explicit ? { layoutId: "without-topbar" } : {},
  });
  return extensionAssignmentSchema.parse({
    ...assignment,
    layout: layoutBinding(),
  });
}

/** Только reader fixture: эти records не создаются новым prepare/apply writer. */
function boundStoreFixture() {
  const assignment = boundAssignment();
  const initial = createExtensionAppearanceStore({ admin: assignment });
  const { hash: _hash, ...prior } = legacyFixture().prepared.store.plans[0];
  const command = {
    action: "assign",
    target: "admin",
    expectedRevision: 0,
    expectedCatalogHash: hostCatalogHash,
    selection: assignment.selection,
    settings: assignment.settings,
  };
  const content = {
    ...prior,
    catalogHash: hostCatalogHash,
    stateHash: hashExtensionValue({
      target: "admin",
      state: initial.targets.admin,
    }),
    inputFingerprint: hashExtensionValue(command),
    desiredAssignment: assignment,
  };
  const plan: ExtensionAppearancePlan = {
    ...content,
    hash: hashExtensionValue(content),
  };
  const prepareReceipt: ExtensionPrepareReceipt = {
    kind: "prepare",
    actorKey,
    requestId,
    inputFingerprint: plan.inputFingerprint,
    plan,
    current: assignment,
  };
  const applyReceipt: ExtensionApplyReceipt = {
    kind: "apply",
    actorKey,
    requestId: applyRequestId,
    inputFingerprint: hashExtensionValue({
      planId,
      expectedPlanHash: plan.hash,
    }),
    planId,
    target: "admin",
    appliedRevision: 1,
    assignment,
    appliedAt: new Date(nowMs + 1000).toISOString(),
  };
  const pending: ExtensionAppearanceStore = {
    ...initial,
    plans: [plan],
    receipts: [prepareReceipt],
  };
  const applied: ExtensionAppearanceStore = {
    ...initial,
    targets: {
      ...initial.targets,
      admin: { revision: 1, current: assignment, previous: assignment },
    },
    receipts: [prepareReceipt, applyReceipt],
  };
  return { assignment, plan, prepareReceipt, applyReceipt, pending, applied };
}

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const expectCode = (operation: () => unknown, code: string) =>
  expect(operation).toThrowError(expect.objectContaining({ code }));

describe("Golden legacy без layout binding", () => {
  it("сохраняет legacy wire-форму, plan hash и canonical hashes обоих receipts", () => {
    const { catalog, assignment, prepared, applied } = legacyFixture();
    const parsed = extensionAssignmentSchema.parse(wire(assignment));
    expect(parsed).toEqual(assignment);
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(assignment));
    expect(Object.keys(parsed).sort()).toEqual([
      "manifestHash",
      "selection",
      "settings",
    ]);
    expect(Object.hasOwn(parsed, "layout")).toBe(false);
    expect(catalog.catalogHash).toBe(legacyHashes.catalog);
    expect(assignment.manifestHash).toBe(legacyHashes.manifest);
    expect(hashExtensionValue(parsed)).toBe(legacyHashes.assignment);
    expect(prepared.plan.planHash).toBe(legacyHashes.plan);
    expect(hashExtensionValue(prepared.plan)).toBe(legacyHashes.planDto);
    expect(hashExtensionValue(prepared.store.receipts[0])).toBe(
      legacyHashes.prepareReceipt,
    );
    expect(hashExtensionValue(applied.receipt)).toBe(legacyHashes.applyDto);
    expect(hashExtensionValue(applied.store)).toBe(legacyHashes.appliedStore);
    expect(
      extensionAppearanceStateCodec.parseStore(wire(applied.store)),
    ).toEqual(applied.store);
    for (const receipt of applied.store.receipts)
      expect(extensionAppearanceStateCodec.parseReceipt(wire(receipt))).toEqual(
        receipt,
      );
  });

  it("повторяет старые prepare/apply receipts без добавления optional полей", () => {
    const prior = legacyFixture();
    const prepared = prepareExtensionAppearance({
      catalog: prior.catalog,
      store: wire(prior.applied.store),
      actorKey,
      requestId,
      planId,
      nowMs: nowMs + 2000,
      input: prior.command,
    });
    expect(prepared.replayed).toBe(true);
    expect(prepared.plan).toEqual(prior.prepared.plan);
    const applied = applyExtensionAppearance({
      catalog: prior.catalog,
      store: prepared.store,
      actorKey,
      requestId: applyRequestId,
      nowMs: nowMs + 3000,
      input: { planId, expectedPlanHash: legacyHashes.plan },
    });
    expect(applied.replayed).toBe(true);
    expect(applied.receipt).toEqual(prior.applied.receipt);
    expect(hashExtensionValue(applied.store)).toBe(legacyHashes.appliedStore);
    expect(Object.hasOwn(applied.receipt.assignment, "layout")).toBe(false);
  });

  it("не переосмысляет legacy settings без binding как новый layout контракт", () => {
    const assignment = legacyFixture().assignment;
    expect(
      extensionAssignmentSchema.parse({
        ...assignment,
        settings: { ...assignment.settings, layoutId: null },
      }).settings.layoutId,
    ).toBeNull();
    expect(
      extensionAssignmentSchema.safeParse({ ...assignment, layout: undefined })
        .success,
    ).toBe(false);
    expect(
      extensionAssignmentSchema.safeParse({ ...assignment, layout: null })
        .success,
    ).toBe(false);
  });
});

describe("Чтение строгого layout binding SDK", () => {
  it("отделяет и глубоко замораживает snapshot, не выполняя lookup неизвестного ref", () => {
    const input = layoutBinding();
    const parsed = parseLayoutAssignmentBinding(input);
    expect(layoutAssignmentBindingSchema.parse(input)).toEqual(parsed);
    input.reference.identity.id = "changed";
    input.reference.version = "0.2.0";
    expect(parsed.reference.version).toBe("0.1.0");
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.reference)).toBe(true);
    expect(Object.isFrozen(parsed.reference.identity)).toBe(true);
    const unknown = {
      ...layoutBinding(),
      localId: "unregistered",
      reference: {
        identity: { namespace: "unknown", id: "layout.unknown" },
        version: "9.0.0",
      },
      catalogHash: "a".repeat(64),
    };
    expect(parseLayoutAssignmentBinding(unknown)).toEqual(unknown);
  });

  it("отклоняет getters, cycles, неплоские prototypes и превышение JSON bounds", () => {
    const getter = vi.fn(() => "a".repeat(64));
    const accessor = layoutBinding();
    Object.defineProperty(accessor, "catalogHash", {
      enumerable: true,
      get: getter,
    });
    expectCode(
      () => parseLayoutAssignmentBinding(accessor),
      "INVALID_LAYOUT_BINDING",
    );
    expect(getter).not.toHaveBeenCalled();
    const cycle: Record<string, unknown> = { ...layoutBinding() };
    cycle.self = cycle;
    const large = Object.assign(
      {},
      layoutBinding(),
      Object.fromEntries(
        Array.from({ length: 4097 }, (_, index) => [`extra${index}`, index]),
      ),
    );
    const prototype = Object.assign(
      Object.create({ hidden: true }),
      layoutBinding(),
    );
    for (const value of [cycle, large, prototype])
      expectCode(
        () => parseLayoutAssignmentBinding(value),
        "INVALID_LAYOUT_BINDING",
      );
  });

  it.each(["", "f".repeat(63), "g".repeat(64), "F".repeat(64)])(
    "отклоняет malformed catalog hash %s",
    (catalogHash) => {
      expectCode(
        () => parseLayoutAssignmentBinding({ ...layoutBinding(), catalogHash }),
        "INVALID_LAYOUT_BINDING",
      );
    },
  );

  it.each(["latest", "*", "^0.1.0", "0.1"])(
    "отклоняет неточный version pin %s",
    (version) => {
      const input = layoutBinding();
      expectCode(
        () =>
          parseLayoutAssignmentBinding({
            ...input,
            reference: { ...input.reference, version },
          }),
        "INVALID_LAYOUT_BINDING",
      );
    },
  );

  it("не принимает поля команд, неизвестные nested keys и отсутствующие поля binding", () => {
    const input = layoutBinding();
    const { catalogHash: _catalogHash, ...missing } = input;
    for (const value of [
      { ...input, execute: "npm install" },
      { ...input, reference: { ...input.reference, source: "/tmp/layout" } },
      { ...input, localId: "*" },
      missing,
      null,
    ])
      expectCode(
        () => parseLayoutAssignmentBinding(value),
        "INVALID_LAYOUT_BINDING",
      );
  });

  it("сообщает безопасный reference path без эха неизвестных входных ключей или значений", () => {
    const input = layoutBinding();
    expect(() =>
      parseLayoutAssignmentBinding({
        ...input,
        reference: { ...input.reference, version: "^0.1.0" },
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "INVALID_LAYOUT_BINDING",
        path: "/reference/version",
      }),
    );
    let failure: unknown;
    try {
      parseLayoutAssignmentBinding({
        ...input,
        "private-fixture-input-key": "private-fixture-input-value",
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      code: "INVALID_LAYOUT_BINDING",
      path: "/",
    });
    const diagnostic = `${String(failure)} ${JSON.stringify(failure)}`;
    expect(diagnostic).not.toContain("private-fixture-input-key");
    expect(diagnostic).not.toContain("private-fixture-input-value");
  });
});

describe("Optional binding в общих assignment/DTO/storage readers", () => {
  it("принимает совпадающий explicit alias и отсутствие alias при наследовании", () => {
    expect(boundAssignment().layout?.localId).toBe("without-topbar");
    const inherited = boundAssignment(false);
    expect(inherited.layout?.localId).toBe("without-topbar");
    expect(Object.hasOwn(inherited.settings, "layoutId")).toBe(false);
  });

  it.each([null, "default", "", 7, false])(
    "отклоняет explicit layoutId %j, не совпадающий с binding",
    (layoutId) => {
      const assignment = boundAssignment();
      expect(
        extensionAssignmentSchema.safeParse({
          ...assignment,
          settings: { ...assignment.settings, layoutId },
        }).success,
      ).toBe(false);
    },
  );

  it.each([null, undefined, [], "settings"])(
    "возвращает validation failure для malformed settings %j без throw",
    (settings) => {
      expect(
        extensionAssignmentSchema.safeParse({ ...boundAssignment(), settings })
          .success,
      ).toBe(false);
    },
  );

  it("не исполняет accessor layoutId при чтении malformed assignment settings", () => {
    const getter = vi.fn(() => "without-topbar");
    const settings = {};
    Object.defineProperty(settings, "layoutId", {
      enumerable: true,
      get: getter,
    });
    expect(
      extensionAssignmentSchema.safeParse({ ...boundAssignment(), settings })
        .success,
    ).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  it("сохраняет binding в current/previous, pending plan и обоих видах ledger receipts", () => {
    const fixture = boundStoreFixture();
    expect(
      extensionAppearanceStateCodec.parseStore(wire(fixture.pending)),
    ).toEqual(fixture.pending);
    const parsed = extensionAppearanceStateCodec.parseStore(
      wire(fixture.applied),
    );
    expect(parsed).toEqual(fixture.applied);
    expect(parsed.targets.admin.current?.layout).toEqual(
      fixture.assignment.layout,
    );
    expect(parsed.targets.admin.previous?.layout).toEqual(
      fixture.assignment.layout,
    );
    for (const receipt of [fixture.prepareReceipt, fixture.applyReceipt]) {
      expect(extensionAppearanceReceiptSchema.parse(wire(receipt))).toEqual(
        receipt,
      );
      expect(extensionAppearanceStateCodec.parseReceipt(wire(receipt))).toEqual(
        receipt,
      );
    }
    const planDto = mapExtensionAppearancePlan(
      fixture.plan,
      fixture.assignment,
    );
    expect(extensionAppearancePlanDtoSchema.parse(wire(planDto))).toEqual(
      planDto,
    );
    expect(planDto.current?.layout).toEqual(fixture.assignment.layout);
    expect(planDto.desiredAssignment.layout).toEqual(fixture.assignment.layout);
    const receiptDto = mapExtensionAppearanceReceipt(fixture.applyReceipt);
    expect(extensionAppearanceReceiptDtoSchema.parse(wire(receiptDto))).toEqual(
      receiptDto,
    );
    expect(receiptDto.assignment.layout).toEqual(fixture.assignment.layout);
    expect(planDto.desiredAssignment.layout).not.toBe(
      fixture.plan.desiredAssignment.layout,
    );
    expect(receiptDto.assignment.layout).not.toBe(
      fixture.applyReceipt.assignment.layout,
    );
  });

  it("не теряет layout при hash validation и отказывает tampered stored plan", () => {
    const { pending } = boundStoreFixture();
    const tampered = wire(pending);
    for (const plan of [
      tampered.plans[0],
      ...tampered.receipts.flatMap((receipt) =>
        receipt.kind === "prepare" ? [receipt.plan] : [],
      ),
    ]) {
      if (!plan.desiredAssignment.layout)
        throw new Error("Reader fixture requires layout");
      Reflect.set(plan.desiredAssignment.layout.reference, "version", "0.1.1");
    }
    expectCode(
      () => extensionAppearanceStateCodec.parseStore(tampered),
      "INVALID_STORE",
    );
  });

  it("сохраняет nested assignment binding в Admin Shell plan/store/DTO", () => {
    const assignment = boundAssignment();
    const templateBinding = adminShellTemplateBindingSchema.parse({
      appearanceRevision: 0,
      appearanceHash: hashExtensionValue(assignment),
      catalogHash: hostCatalogHash,
      assignment,
    });
    const content: Omit<AdminShellPlan, "hash"> = {
      id: planId,
      actorKey,
      requestId,
      inputFingerprint: "a".repeat(64),
      action: "select",
      currentMode: "native",
      desiredMode: "template",
      expectedRevision: 0,
      stateHash: "b".repeat(64),
      policyHash: "c".repeat(64),
      templateBinding,
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + 60_000).toISOString(),
    };
    const plan: AdminShellPlan = {
      ...content,
      hash: hashExtensionValue(content),
    };
    const store: AdminShellStore = {
      schemaVersion: "1.0",
      domain: "admin-shell",
      state: { revision: 0, current: "native", previous: null },
      plans: [plan],
      receipts: [
        {
          kind: "prepare",
          actorKey,
          requestId,
          inputFingerprint: plan.inputFingerprint,
          plan,
        },
      ],
    };
    expect(parseAdminShellStore(wire(store))).toEqual(store);
    expect(adminShellReceiptSchema.parse(wire(store.receipts[0]))).toEqual(
      store.receipts[0],
    );
    const dto = mapAdminShellPlan(plan);
    expect(adminShellPlanDtoSchema.parse(wire(dto))).toEqual(dto);
    expect(dto.templateBinding?.assignment.layout).toEqual(assignment.layout);
    expect(dto.templateBinding?.assignment.layout).not.toBe(assignment.layout);
  });
});

describe("Reader-before-writer остаётся без нового канала записи", () => {
  it("отклоняет layout injection в assign/recover/apply commands", () => {
    const fixture = legacyFixture();
    const assign = { ...fixture.command, layout: layoutBinding() };
    const recover = {
      action: "recover",
      target: "admin",
      expectedRevision: 1,
      expectedCatalogHash: fixture.catalog.catalogHash,
      layout: layoutBinding(),
    };
    expect(prepareExtensionAppearanceSchema.safeParse(assign).success).toBe(
      false,
    );
    expect(prepareExtensionAppearanceSchema.safeParse(recover).success).toBe(
      false,
    );
    expectCode(
      () =>
        prepareExtensionAppearance({
          catalog: fixture.catalog,
          store: createExtensionAppearanceStore(),
          actorKey,
          requestId,
          planId,
          nowMs,
          input: assign,
        }),
      "INVALID_INPUT",
    );
    const apply = {
      planId,
      expectedPlanHash: fixture.prepared.plan.planHash,
      layout: layoutBinding(),
    };
    expect(applyExtensionAppearanceSchema.safeParse(apply).success).toBe(false);
    expectCode(
      () =>
        applyExtensionAppearance({
          catalog: fixture.catalog,
          store: fixture.prepared.store,
          actorKey,
          requestId: applyRequestId,
          nowMs,
          input: apply,
        }),
      "INVALID_INPUT",
    );
  });

  it("сохраняет catalog hash и прежнюю форму writer при исторической registration без layouts", () => {
    const catalog = hostCatalog();
    expect(catalog.catalogHash).toBe(hostCatalogHash);
    for (const settings of [{}, { layoutId: "without-topbar" }]) {
      const assignment = resolveExtensionAssignment({
        catalog,
        target: "admin",
        selection: controlPanelSelection(),
        settings,
      });
      expect(Object.hasOwn(assignment, "layout")).toBe(false);
      const prepared = prepareExtensionAppearance({
        catalog,
        store: createExtensionAppearanceStore(),
        actorKey,
        requestId,
        planId,
        nowMs,
        input: {
          action: "assign",
          target: "admin",
          expectedRevision: 0,
          expectedCatalogHash: catalog.catalogHash,
          selection: controlPanelSelection(),
          settings,
        },
      });
      expect(prepared.plan.readiness).toBe("preview-only");
      expect(Object.hasOwn(prepared.plan.desiredAssignment, "layout")).toBe(
        false,
      );
      expect(
        Object.hasOwn(prepared.store.plans[0].desiredAssignment, "layout"),
      ).toBe(false);
    }
  });
});
