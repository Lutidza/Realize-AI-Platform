/**
 * @file scripts/runtime/layout-reader/createLayoutReaderFixtures.mjs
 * @version 1.0.0
 * @date 2026-11-21
 * @description Создаёт синтетические JSON fixtures для проверки readers в изолированном production artifact.
 * @see documentation/reports/2026-11-21-layout-reader-delivery-rollback-audit.md
 */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import legacyManifest from "@realize/template-realize/manifest.json" with { type: "json" };
import legacySettingsSchema from "@realize/template-realize/settings.schema.json" with { type: "json" };
import { resolveRealizeSettings } from "@realize/template-realize/settings";
import { controlPanelManifest } from "@realize/template-realizeai-control-panel/manifest";
import { controlPanelLayoutCatalog } from "@realize/template-realizeai-control-panel/layouts";
import controlPanelSettingsSchema from "@realize/template-realizeai-control-panel/settings.schema.json" with { type: "json" };
import { resolveControlPanelSettings } from "@realize/template-realizeai-control-panel/settings";
import {
  adminShellReceiptSchema,
  mapExtensionCatalog,
} from "@realize/payload-extension-manager/contracts";
import {
  applyAdminShell,
  applyExtensionAppearance,
  createAdminShellStore,
  createExtensionAppearanceStore,
  createExtensionCatalog,
  extensionAppearanceStateCodec,
  hashAdminShellPolicy,
  parseAdminShellStore,
  prepareAdminShell,
  prepareExtensionAppearance,
  resolveExtensionAssignment,
} from "@realize/payload-extension-manager/server";
import { hashExtensionValue } from "../../../packages/payload-extension-manager/src/appearance/hashExtensionValue.server.ts";
import { getInstalledAssignmentIssue } from "../../../packages/payload-extension-manager/src/installed-templates/getInstalledAssignmentIssue.validator.ts";

const { values } = parseArgs({
  options: { output: { type: "string" } },
  allowPositionals: false,
});
if (!values.output?.trim())
  throw new Error("Укажите --output <path> для локального JSON fixture.");
const outputPath = resolve(values.output);

const hostCompatibility = {
  contractVersion: "1.0",
  platformVersion: "1.0.0",
  reactVersion: "19.2.8",
  nextVersion: "16.4.5",
};
const context = {
  actorKey: "users:layout-reader-fixture",
  nowMs: Date.parse("2026-11-18T08:00:00.000Z"),
};
const requestId = "b884bc5d-66af-4ee1-8d36-a1761745bc11";
const applyRequestId = "d0237d3b-9254-42be-959d-067443cc6411";
const planId = "3fc622af-0dc6-43a3-8650-e0ae99aa0111";
const shellRequestId = "b884bc5d-66af-4ee1-8d36-a1761745bc12";
const shellApplyRequestId = "d0237d3b-9254-42be-959d-067443cc6412";
const shellPlanId = "3fc622af-0dc6-43a3-8650-e0ae99aa0112";

// Независимые значения сняты до reader-среза; генератор не заменяет их новыми hashes.
const legacyGoldens = {
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

/** JSON отделяет fixtures от source objects и намеренно удаляет compiled resolver functions. */
function wire(value) {
  return JSON.parse(JSON.stringify(value));
}

function selection(manifest) {
  return {
    templateId: manifest.id,
    templateVersion: manifest.version,
    target: "admin",
    paletteId: manifest.palettes[0].id,
    paletteVersion: manifest.palettes[0].version,
    mode: "light",
  };
}

function assignCommand(catalog, selected, settings) {
  return {
    action: "assign",
    target: "admin",
    expectedRevision: 0,
    expectedCatalogHash: catalog.catalogHash,
    selection: selected,
    settings,
  };
}

/** Проверка default gate выполняется без policy override и не меняет переданный store. */
function assertDisabled(operation, input) {
  const before = JSON.stringify(input);
  assert.throws(() => operation(input), {
    code: "LAYOUT_BINDING_WRITES_DISABLED",
  });
  assert.equal(JSON.stringify(input), before);
}

function legacyFixture() {
  const catalog = createExtensionCatalog({
    entries: [
      {
        manifest: legacyManifest,
        settingsSchema: legacySettingsSchema,
        resolveSettings: resolveRealizeSettings,
      },
    ],
    runtimeBuildId: "layout-reader-legacy-fixture",
    hostCompatibility,
  });
  const selected = selection(legacyManifest);
  const assignment = resolveExtensionAssignment({
    catalog,
    target: "admin",
    selection: selected,
    settings: {},
  });
  const initial = createExtensionAppearanceStore({ admin: assignment });
  const commands = {
    prepare: assignCommand(catalog, selected, { density: "compact" }),
  };
  const prepareInput = {
    ...context,
    requestId,
    planId,
    store: initial,
    input: commands.prepare,
  };
  const prepared = prepareExtensionAppearance({ catalog, ...prepareInput });
  commands.apply = { planId, expectedPlanHash: prepared.plan.planHash };
  const applyInput = {
    ...context,
    nowMs: context.nowMs + 1000,
    requestId: applyRequestId,
    store: prepared.store,
    input: commands.apply,
  };
  const applied = applyExtensionAppearance({ catalog, ...applyInput });
  const actual = {
    catalog: catalog.catalogHash,
    manifest: assignment.manifestHash,
    assignment: hashExtensionValue(assignment),
    plan: prepared.plan.planHash,
    planDto: hashExtensionValue(prepared.plan),
    prepareReceipt: hashExtensionValue(prepared.store.receipts[0]),
    applyDto: hashExtensionValue(applied.receipt),
    appliedStore: hashExtensionValue(applied.store),
  };
  assert.deepEqual(actual, legacyGoldens);
  assert.equal(Object.hasOwn(assignment, "layout"), false);
  extensionAppearanceStateCodec.parseStore(wire(applied.store));
  const replay = {
    prepare: {
      ...prepareInput,
      store: applied.store,
      nowMs: context.nowMs + 2000,
    },
    apply: {
      ...applyInput,
      store: applied.store,
      nowMs: context.nowMs + 3000,
    },
  };
  assert.equal(
    prepareExtensionAppearance({ catalog, ...replay.prepare }).replayed,
    true,
  );
  assert.equal(
    applyExtensionAppearance({ catalog, ...replay.apply }).replayed,
    true,
  );
  return {
    catalog,
    catalogDto: mapExtensionCatalog(catalog),
    settingsProbe: {
      input: {},
      expected: resolveRealizeSettings({}),
      invalid: { layoutId: "without-topbar" },
    },
    context,
    commands,
    assignment,
    initial,
    prepared,
    applied,
    goldens: legacyGoldens,
    replay,
  };
}

function awareFixture() {
  const catalog = createExtensionCatalog({
    entries: [
      {
        manifest: legacyManifest,
        settingsSchema: legacySettingsSchema,
        resolveSettings: resolveRealizeSettings,
      },
      {
        manifest: controlPanelManifest,
        settingsSchema: controlPanelSettingsSchema,
        resolveSettings: resolveControlPanelSettings,
        readiness: "ready",
        layouts: {
          templateIdentity: {
            namespace: "realize",
            id: "realizeai-control-panel",
          },
          catalog: controlPanelLayoutCatalog,
        },
      },
    ],
    runtimeBuildId: "layout-reader-ready-fixture-only",
    hostCompatibility,
  });
  const selected = selection(controlPanelManifest);
  const resolve = (settings) =>
    resolveExtensionAssignment({
      catalog,
      target: "admin",
      selection: selected,
      settings,
    });
  const assignments = {
    inherited: resolve({}),
    explicitDefault: resolve({ layoutId: "default" }),
    withoutTopbar: resolve({ layoutId: "without-topbar" }),
  };
  assert.equal(
    Object.hasOwn(assignments.inherited.settings, "layoutId"),
    false,
  );
  assert.deepEqual(
    assignments.inherited.layout,
    assignments.explicitDefault.layout,
  );
  const initial = createExtensionAppearanceStore({
    admin: assignments.inherited,
  });
  const commands = {
    prepare: assignCommand(catalog, selected, { layoutId: "without-topbar" }),
  };
  const prepareInput = {
    ...context,
    requestId,
    planId,
    store: initial,
    input: commands.prepare,
  };
  assertDisabled(prepareExtensionAppearance, { catalog, ...prepareInput });
  // Только synthetic in-memory store: enabled не попадает в operation fixtures или runtime config.
  const prepared = prepareExtensionAppearance({
    catalog,
    ...prepareInput,
    layoutAssignmentWrites: "enabled",
  });
  commands.apply = { planId, expectedPlanHash: prepared.plan.planHash };
  const applyInput = {
    ...context,
    nowMs: context.nowMs + 1000,
    requestId: applyRequestId,
    store: prepared.store,
    input: commands.apply,
  };
  assertDisabled(applyExtensionAppearance, { catalog, ...applyInput });
  const applied = applyExtensionAppearance({
    catalog,
    ...applyInput,
    layoutAssignmentWrites: "enabled",
  });
  const appearance = {
    initial,
    pending: prepared.store,
    applied: applied.store,
    plan: prepared.store.plans[0],
    prepareReceipt: prepared.store.receipts[0],
    applyReceipt: applied.store.receipts[1],
    dto: {
      plan: prepared.plan,
      receipt: applied.receipt,
      prepareResponse: { plan: prepared.plan, replayed: false },
      applyResponse: { receipt: applied.receipt, replayed: false },
    },
    inputs: { prepare: prepareInput, apply: applyInput },
    replay: {
      prepare: {
        ...prepareInput,
        store: applied.store,
        nowMs: context.nowMs + 2000,
      },
      apply: {
        ...applyInput,
        store: applied.store,
        nowMs: context.nowMs + 3000,
      },
    },
  };
  for (const store of [appearance.pending, appearance.applied]) {
    extensionAppearanceStateCodec.parseStore(wire(store));
    for (const receipt of store.receipts)
      extensionAppearanceStateCodec.parseReceipt(wire(receipt));
  }
  assert.equal(
    prepareExtensionAppearance({ catalog, ...appearance.replay.prepare })
      .replayed,
    true,
  );
  assert.equal(
    applyExtensionAppearance({ catalog, ...appearance.replay.apply }).replayed,
    true,
  );
  const adminShell = shellFixture(catalog, applied.store);
  const missingPin = wire(assignments.withoutTopbar);
  delete missingPin.layout;
  const mismatchedPin = wire(assignments.withoutTopbar);
  mismatchedPin.layout.reference.version = "0.1.1";
  const inventory = [
    {
      name: "valid",
      assignment: assignments.withoutTopbar,
      expectedIssue: null,
    },
    {
      name: "missing-pin",
      assignment: missingPin,
      expectedIssue: "invalid_assignment",
    },
    {
      name: "mismatched-pin",
      assignment: mismatchedPin,
      expectedIssue: "invalid_assignment",
    },
  ];
  for (const item of inventory)
    assert.equal(
      getInstalledAssignmentIssue(catalog, "admin", item.assignment),
      item.expectedIssue,
    );
  return {
    fixtureOnlyReadiness: "ready",
    catalog,
    catalogDto: mapExtensionCatalog(catalog),
    settingsProbe: {
      input: {},
      expected: resolveControlPanelSettings({}),
      invalid: { layoutId: "unknown-layout" },
      explicitDefault: {
        input: { layoutId: "default" },
        expected: resolveControlPanelSettings({ layoutId: "default" }),
      },
      withoutTopbar: {
        input: { layoutId: "without-topbar" },
        expected: resolveControlPanelSettings({ layoutId: "without-topbar" }),
      },
    },
    context,
    commands,
    assignments,
    appearance,
    adminShell,
    inventory,
  };
}

function shellFixture(catalog, appearanceStore) {
  const policy = {
    enabled: { native: true, template: true },
    defaultMode: "native",
    fallbackMode: "native",
    nativeVersion: "3.88.0",
    nativeRoute: "/admin",
    templateRoute: "/system",
  };
  const initial = createAdminShellStore(policy);
  const commands = {
    prepare: {
      action: "select",
      mode: "template",
      expectedRevision: 0,
      expectedPolicyHash: hashAdminShellPolicy(policy),
    },
  };
  // В JSON отсутствует catalog: artifact runner добавляет свой compiled resolver в собственном realm.
  const prepareInput = {
    ...context,
    requestId: shellRequestId,
    planId: shellPlanId,
    store: initial,
    policy,
    appearance: { store: appearanceStore },
    input: commands.prepare,
  };
  const withCatalog = (input) => ({
    ...input,
    appearance: { ...input.appearance, catalog },
  });
  assertDisabled(prepareAdminShell, withCatalog(prepareInput));
  const prepared = prepareAdminShell({
    ...withCatalog(prepareInput),
    layoutAssignmentWrites: "enabled",
  });
  commands.apply = {
    planId: shellPlanId,
    expectedPlanHash: prepared.plan.planHash,
  };
  const applyInput = {
    ...context,
    nowMs: context.nowMs + 1000,
    requestId: shellApplyRequestId,
    store: prepared.store,
    policy,
    appearance: { store: appearanceStore },
    input: commands.apply,
  };
  assertDisabled(applyAdminShell, withCatalog(applyInput));
  const applied = applyAdminShell({
    ...withCatalog(applyInput),
    layoutAssignmentWrites: "enabled",
  });
  const replay = {
    prepare: {
      ...prepareInput,
      store: applied.store,
      nowMs: context.nowMs + 2000,
    },
    apply: {
      ...applyInput,
      store: applied.store,
      nowMs: context.nowMs + 3000,
    },
  };
  for (const store of [prepared.store, applied.store]) {
    parseAdminShellStore(wire(store));
    for (const receipt of store.receipts)
      adminShellReceiptSchema.parse(wire(receipt));
  }
  assert.equal(prepareAdminShell(withCatalog(replay.prepare)).replayed, true);
  assert.equal(applyAdminShell(withCatalog(replay.apply)).replayed, true);
  return {
    policy,
    commands,
    initial,
    pending: prepared.store,
    applied: applied.store,
    plan: prepared.store.plans[0],
    prepareReceipt: prepared.store.receipts[0],
    applyReceipt: applied.store.receipts[1],
    dto: {
      plan: prepared.plan,
      receipt: applied.receipt,
      prepareResponse: { plan: prepared.plan, replayed: false },
      applyResponse: { receipt: applied.receipt, replayed: false },
    },
    inputs: { prepare: prepareInput, apply: applyInput },
    replay,
  };
}

const legacy = legacyFixture();
const aware = awareFixture();
const fixtures = wire({
  schemaVersion: "1.0",
  kind: "layout-reader-artifact-fixtures",
  fixtureOnly: true,
  generatedBy: "scripts/runtime/layout-reader/createLayoutReaderFixtures.mjs",
  legacy,
  aware,
  gates: {
    expectedCode: "LAYOUT_BINDING_WRITES_DISABLED",
    appearancePrepare: aware.appearance.inputs.prepare,
    appearanceApply: aware.appearance.inputs.apply,
    adminShellPrepare: aware.adminShell.inputs.prepare,
    adminShellApply: aware.adminShell.inputs.apply,
  },
});
await writeFile(outputPath, `${JSON.stringify(fixtures, null, 2)}\n`, {
  flag: "w",
});
console.log(
  "[layout-reader] JSON fixtures generated; source goldens and default-disabled guards verified.",
);
