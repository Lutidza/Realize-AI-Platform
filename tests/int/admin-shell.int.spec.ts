// @vitest-environment node
/**
 * @file tests/int/admin-shell.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет отдельный native/custom lifecycle, policy CAS и сохранение appearance без DB claims.
 * @see documentation/specifications/extension-management.md
 */
import { describe, expect, it } from "vitest";
import manifest from "@realize/template-realize/manifest.json";
import settingsSchema from "@realize/template-realize/settings.schema.json";
import { resolveRealizeSettings } from "@realize/template-realize/settings";
import {
  ExtensionManagerError,
  adminShellPolicySchema,
  adminShellPlanDtoSchema,
  adminShellReceiptDtoSchema,
  adminShellSnapshotSchema,
  adminShellPrepareResponseSchema,
  adminShellApplyResponseSchema,
  type AdminShellPolicy,
  type AdminShellStore,
  type AdminShellMode,
  type AdminShellAppearance,
  type PrepareAdminShellResult,
  type ExtensionManagerErrorCode,
} from "../../packages/payload-extension-manager/src/extensionManagerContracts.index";
import { createExtensionCatalog } from "../../packages/payload-extension-manager/src/catalog/createExtensionCatalog.service";
import { resolveExtensionAssignment } from "../../packages/payload-extension-manager/src/catalog/resolveExtensionAssignment.validator";
import { createExtensionAppearanceStore } from "../../packages/payload-extension-manager/src/appearance/createExtensionAppearanceStore.util";
import { hashExtensionValue } from "../../packages/payload-extension-manager/src/appearance/hashExtensionValue.server";
import { createAdminShellStore } from "../../packages/payload-extension-manager/src/admin-shell/createAdminShellStore.util";
import { parseAdminShellStore } from "../../packages/payload-extension-manager/src/admin-shell/parseAdminShellStore.validator";
import { hashAdminShellPolicy } from "../../packages/payload-extension-manager/src/admin-shell/hashAdminShellPolicy.server";
import { prepareAdminShell } from "../../packages/payload-extension-manager/src/admin-shell/prepareAdminShell.service";
import { previewAdminShell } from "../../packages/payload-extension-manager/src/admin-shell/previewAdminShell.service";
import { applyAdminShell } from "../../packages/payload-extension-manager/src/admin-shell/applyAdminShell.service";
import { readAdminShellState } from "../../packages/payload-extension-manager/src/admin-shell/readAdminShellState.service";

const NOW = Date.parse("2026-10-12T16:00:00.000Z");
const ACTOR = "users:17";
function uuid(seed: number) {
  return `00000000-0000-4000-8000-${seed.toString(16).padStart(12, "0")}`;
}
function policy(): AdminShellPolicy {
  return {
    enabled: { native: true, template: true },
    defaultMode: "template",
    fallbackMode: "native",
    nativeVersion: "3.88.0",
    nativeRoute: "/admin",
    templateRoute: "/system/task-manager",
  };
}
function appearance(): AdminShellAppearance {
  const catalog = createExtensionCatalog({
    entries: [
      { manifest, settingsSchema, resolveSettings: resolveRealizeSettings },
    ],
    hostCompatibility: {
      contractVersion: "1.0",
      platformVersion: "1.0.0",
      reactVersion: "19.2.8",
      nextVersion: "16.3.1",
    },
  });
  const assignment = resolveExtensionAssignment({
    catalog,
    target: "admin",
    selection: {
      templateId: "realize",
      templateVersion: "0.1.0",
      target: "admin",
      paletteId: "realize",
      paletteVersion: "0.1.0",
      mode: "dark",
    },
    settings: { density: "compact", panelWidth: 320 },
  });
  const store = createExtensionAppearanceStore({ admin: assignment });
  store.targets.admin.revision = 2;
  return { catalog, store };
}
function select(
  store: AdminShellStore,
  currentPolicy: AdminShellPolicy,
  mode: AdminShellMode = "native",
) {
  return {
    action: "select" as const,
    mode,
    expectedRevision: store.state.revision,
    expectedPolicyHash: hashAdminShellPolicy(currentPolicy),
  };
}
function prepare(
  store: AdminShellStore,
  currentPolicy: AdminShellPolicy,
  seed: number,
  mode: AdminShellMode = "native",
  currentAppearance: AdminShellAppearance | null = null,
): PrepareAdminShellResult {
  return prepareAdminShell({
    store,
    policy: currentPolicy,
    appearance: currentAppearance,
    actorKey: ACTOR,
    requestId: uuid(seed),
    planId: uuid(seed + 1000),
    input: select(store, currentPolicy, mode),
    nowMs: NOW,
  });
}
function apply(
  prepared: PrepareAdminShellResult,
  currentPolicy: AdminShellPolicy,
  seed: number,
  currentAppearance: AdminShellAppearance | null = null,
  nowMs = NOW + 1,
) {
  return applyAdminShell({
    store: prepared.store,
    policy: currentPolicy,
    appearance: currentAppearance,
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
  let error: unknown;
  try {
    operation();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(ExtensionManagerError);
  expect(error).toMatchObject({ code });
}

describe("Admin shell host policy and DTO", () => {
  it("represents native as a built-in host mode and hashes vendor/routes/policy independently from custom manifest", () => {
    const original = policy();
    const store = createAdminShellStore(original);
    expect(store).toEqual({
      schemaVersion: "1.0",
      domain: "admin-shell",
      state: { revision: 0, current: "template", previous: null },
      plans: [],
      receipts: [],
    });
    const prepared = prepare(store, original, 1);
    expect(prepared.plan.templateBinding).toBeNull();
    expect(JSON.stringify(prepared.plan)).not.toContain("templateId");
    for (const changed of [
      { ...original, nativeVersion: "3.89.0" },
      { ...original, nativeRoute: "/cms" },
      { ...original, templateRoute: "/workspace" },
      { ...original, defaultMode: "native" as const },
    ])
      expect(hashAdminShellPolicy(changed)).not.toBe(
        hashAdminShellPolicy(original),
      );
    expect(
      hashAdminShellPolicy({
        ...original,
        enabled: { template: true, native: true },
      }),
    ).toBe(hashAdminShellPolicy(original));
  });

  it.each([
    ["both disabled", { enabled: { native: false, template: false } }],
    ["disabled default", { enabled: { native: true, template: false } }],
    ["external route", { nativeRoute: "https://evil.test/admin" }],
    ["protocol-relative route", { nativeRoute: "//evil.test" }],
    ["query redirect", { nativeRoute: "/admin?redirect=other" }],
    ["route traversal", { nativeRoute: "/admin/../api" }],
    ["overlapping roots", { nativeRoute: "/system/task-manager" }],
    ["unknown field", { command: "install" }],
  ])("refuses unsafe host policy: %s", (_label, patch) => {
    const input = { ...policy(), ...patch };
    expect(adminShellPolicySchema.safeParse(input).success).toBe(false);
    expectCode(() => hashAdminShellPolicy(input), "INVALID_POLICY");
  });

  it("strict success DTOs preserve candidate identity and omit private replay/actor data", () => {
    const currentPolicy = policy();
    const prepared = prepare(
      createAdminShellStore(currentPolicy),
      currentPolicy,
      1,
      "template",
      appearance(),
    );
    expect(adminShellPlanDtoSchema.safeParse(prepared.plan).success).toBe(true);
    expect(
      adminShellPrepareResponseSchema.safeParse({
        plan: prepared.plan,
        replayed: false,
      }).success,
    ).toBe(true);
    expect(
      adminShellPlanDtoSchema.safeParse({ ...prepared.plan, actorKey: ACTOR })
        .success,
    ).toBe(false);
    expect(
      adminShellPlanDtoSchema.safeParse({
        ...prepared.plan,
        desiredMode: "native",
      }).success,
    ).toBe(false);
    const applied = apply(prepared, currentPolicy, 2, appearance());
    expect(adminShellReceiptDtoSchema.safeParse(applied.receipt).success).toBe(
      true,
    );
    expect(
      adminShellApplyResponseSchema.safeParse({
        receipt: applied.receipt,
        replayed: false,
      }).success,
    ).toBe(true);
    expect(
      adminShellReceiptDtoSchema.safeParse({
        ...applied.receipt,
        requestId: uuid(2),
      }).success,
    ).toBe(false);
    const snapshot = {
      policy: currentPolicy,
      policyHash: hashAdminShellPolicy(currentPolicy),
      state: applied.store.state,
      storage: "ready",
      history: [applied.receipt],
      permissions: { manageShell: true },
    };
    expect(adminShellSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(
      adminShellSnapshotSchema.safeParse({ ...snapshot, privateDocument: {} })
        .success,
    ).toBe(false);
  });
});

describe("Admin shell lifecycle and custom assignment preservation", () => {
  it("prepares/previews/applies native without reading even a malformed custom dependency", () => {
    const currentPolicy = policy();
    const original = createAdminShellStore(currentPolicy);
    let dependencyRead = false;
    const inaccessible = Object.defineProperty({}, "store", {
      get() {
        dependencyRead = true;
        throw new Error("custom storage inaccessible");
      },
    }) as AdminShellAppearance;
    const prepared = prepare(
      original,
      currentPolicy,
      1,
      "native",
      inaccessible,
    );
    expect(original.state).toEqual({
      revision: 0,
      current: "template",
      previous: null,
    });
    const preview = previewAdminShell({
      store: prepared.store,
      policy: currentPolicy,
      appearance: inaccessible,
      actorKey: ACTOR,
      planId: prepared.plan.planId,
      nowMs: NOW,
    });
    expect(preview.desiredMode).toBe("native");
    const applied = apply(prepared, currentPolicy, 2, inaccessible);
    expect(applied.store.state).toEqual({
      revision: 1,
      current: "native",
      previous: "template",
    });
    expect(dependencyRead).toBe(false);
  });

  it("captures exact template settings and preserves both appearance targets through shell change and recovery", () => {
    const currentPolicy = policy();
    const dependency = appearance();
    const dependencySnapshot = structuredClone(dependency.store);
    const native = apply(
      prepare(createAdminShellStore(currentPolicy), currentPolicy, 1),
      currentPolicy,
      2,
    );
    const recovered = prepareAdminShell({
      store: native.store,
      policy: currentPolicy,
      appearance: dependency,
      actorKey: ACTOR,
      requestId: uuid(3),
      planId: uuid(1003),
      input: {
        action: "recover",
        expectedRevision: 1,
        expectedPolicyHash: hashAdminShellPolicy(currentPolicy),
      },
      nowMs: NOW,
    });
    expect(recovered.plan.templateBinding?.assignment).toEqual(
      dependency.store.targets.admin.current,
    );
    expect(recovered.plan.templateBinding?.appearanceRevision).toBe(2);
    const applied = apply(recovered, currentPolicy, 4, dependency);
    expect(applied.store.state).toEqual({
      revision: 2,
      current: "template",
      previous: "native",
    });
    expect(dependency.store).toEqual(dependencySnapshot);
    if (!recovered.plan.templateBinding)
      throw new Error("Missing fixture template binding");
    recovered.plan.templateBinding.assignment.settings.panelWidth = 400;
    expect(
      recovered.store.plans[0].templateBinding?.assignment.settings.panelWidth,
    ).toBe(320);
    expect(dependency.store.targets.admin.current?.settings.panelWidth).toBe(
      320,
    );
  });

  it("refuses recovery without previous mode and selection disabled by host policy", () => {
    const currentPolicy = {
      ...policy(),
      enabled: { native: true, template: false },
      defaultMode: "native" as const,
      fallbackMode: "native" as const,
    };
    const store = createAdminShellStore(currentPolicy);
    expectCode(
      () => prepare(store, currentPolicy, 1, "template", appearance()),
      "SHELL_UNAVAILABLE",
    );
    expectCode(
      () =>
        prepareAdminShell({
          store,
          policy: currentPolicy,
          appearance: null,
          actorKey: ACTOR,
          requestId: uuid(1),
          planId: uuid(1001),
          input: {
            action: "recover",
            expectedRevision: 0,
            expectedPolicyHash: hashAdminShellPolicy(currentPolicy),
          },
          nowMs: NOW,
        }),
      "NO_PREVIOUS_ASSIGNMENT",
    );
  });

  it("binds template plan to appearance revision, exact assignment state and compiled catalog", () => {
    const currentPolicy = policy();
    const dependency = appearance();
    const prepared = prepare(
      createAdminShellStore(currentPolicy),
      currentPolicy,
      1,
      "template",
      dependency,
    );
    const revisionChanged = {
      ...dependency,
      store: structuredClone(dependency.store),
    };
    revisionChanged.store.targets.admin.revision += 1;
    expectCode(
      () => apply(prepared, currentPolicy, 2, revisionChanged),
      "REVISION_CONFLICT",
    );
    const stateChanged = {
      ...dependency,
      store: structuredClone(dependency.store),
    };
    if (!stateChanged.store.targets.admin.current)
      throw new Error("Missing fixture assignment");
    stateChanged.store.targets.admin.current.settings.panelWidth = 360;
    expectCode(
      () => apply(prepared, currentPolicy, 2, stateChanged),
      "STATE_CHANGED",
    );
    const catalogChanged = {
      ...dependency,
      catalog: { ...dependency.catalog, catalogHash: "0".repeat(64) },
    };
    expectCode(
      () => apply(prepared, currentPolicy, 2, catalogChanged),
      "CATALOG_CHANGED",
    );
    const oppositeTarget = {
      ...dependency,
      store: structuredClone(dependency.store),
    };
    oppositeTarget.store.targets.frontend.revision += 1;
    expect(
      apply(prepared, currentPolicy, 2, oppositeTarget).store.state.current,
    ).toBe("template");
  });

  it("does not silently normalize missing/invalid custom settings or execute a disappeared renderer", () => {
    const currentPolicy = policy();
    const dependency = appearance();
    expectCode(
      () =>
        prepare(
          createAdminShellStore(currentPolicy),
          currentPolicy,
          1,
          "template",
        ),
      "SHELL_UNAVAILABLE",
    );
    const missing = { ...dependency, store: createExtensionAppearanceStore() };
    expectCode(
      () =>
        prepare(
          createAdminShellStore(currentPolicy),
          currentPolicy,
          1,
          "template",
          missing,
        ),
      "SHELL_UNAVAILABLE",
    );
    if (!dependency.store.targets.admin.current)
      throw new Error("Missing fixture assignment");
    dependency.store.targets.admin.current.settings = {};
    expectCode(
      () =>
        prepare(
          createAdminShellStore(currentPolicy),
          currentPolicy,
          1,
          "template",
          dependency,
        ),
      "SHELL_UNAVAILABLE",
    );
    dependency.store.targets.admin.current.selection.templateVersion = "0.2.0";
    expectCode(
      () =>
        prepare(
          createAdminShellStore(currentPolicy),
          currentPolicy,
          1,
          "template",
          dependency,
        ),
      "SHELL_UNAVAILABLE",
    );
  });

  it("rejects actor/expiry/policy/base drift without changing either state", () => {
    const currentPolicy = policy();
    const prepared = prepare(
      createAdminShellStore(currentPolicy),
      currentPolicy,
      1,
    );
    const base = {
      store: prepared.store,
      policy: currentPolicy,
      appearance: null,
      actorKey: ACTOR,
      planId: prepared.plan.planId,
      nowMs: NOW,
    };
    const snapshot = structuredClone(prepared.store);
    expectCode(
      () => previewAdminShell({ ...base, actorKey: "users:18" }),
      "PLAN_ACTOR_MISMATCH",
    );
    expectCode(
      () =>
        previewAdminShell({
          ...base,
          nowMs: Date.parse(prepared.plan.expiresAt),
        }),
      "PLAN_EXPIRED",
    );
    expectCode(
      () =>
        previewAdminShell({
          ...base,
          policy: { ...currentPolicy, nativeVersion: "3.89.0" },
        }),
      "POLICY_CHANGED",
    );
    const stateChanged = structuredClone(prepared.store);
    stateChanged.state.previous = "native";
    expectCode(
      () => previewAdminShell({ ...base, store: stateChanged }),
      "STATE_CHANGED",
    );
    expectCode(
      () =>
        applyAdminShell({
          ...base,
          requestId: uuid(2),
          input: { planId: base.planId, expectedPlanHash: "0".repeat(64) },
        }),
      "PLAN_HASH_MISMATCH",
    );
    expect(prepared.store).toEqual(snapshot);
  });

  it("models two competing prepared plans and rejects the second after one CAS winner", () => {
    const currentPolicy = policy();
    const first = prepare(
      createAdminShellStore(currentPolicy),
      currentPolicy,
      1,
    );
    const second = prepare(
      first.store,
      currentPolicy,
      2,
      "template",
      appearance(),
    );
    const winner = apply({ ...first, store: second.store }, currentPolicy, 3);
    expectCode(
      () =>
        apply(
          { ...second, store: winner.store },
          currentPolicy,
          4,
          appearance(),
        ),
      "REVISION_CONFLICT",
    );
    expect(winner.store.state.revision).toBe(1);
  });
});

describe("Admin shell immutable replay and safe fallback", () => {
  it("replays prepare from the durable full plan receipt after pending-plan pruning", () => {
    const currentPolicy = policy();
    const original = createAdminShellStore(currentPolicy);
    const prepared = prepare(original, currentPolicy, 1);
    const replayInput = {
      store: { ...prepared.store, plans: [] },
      policy: currentPolicy,
      appearance: null,
      actorKey: ACTOR,
      requestId: uuid(1),
      planId: uuid(999),
      input: select(original, currentPolicy),
      nowMs: NOW + 1,
    };
    expect(prepareAdminShell(replayInput)).toMatchObject({
      plan: prepared.plan,
      replayed: true,
    });
    expectCode(
      () =>
        prepareAdminShell({
          ...replayInput,
          input: select(original, currentPolicy, "template"),
        }),
      "REPLAY_CONFLICT",
    );
    expectCode(
      () =>
        prepareAdminShell({
          ...replayInput,
          nowMs: Date.parse(prepared.plan.expiresAt),
        }),
      "PLAN_EXPIRED",
    );
  });

  it("returns the exact old apply receipt after TTL, policy change and custom disappearance", () => {
    const currentPolicy = policy();
    const prepared = prepare(
      createAdminShellStore(currentPolicy),
      currentPolicy,
      1,
      "template",
      appearance(),
    );
    const applied = apply(prepared, currentPolicy, 2, appearance());
    const receipt = applied.store.receipts.find(
      (candidate) => candidate.kind === "apply",
    );
    if (!receipt) throw new Error("Missing fixture apply receipt");
    const changedPolicy = {
      ...currentPolicy,
      enabled: { native: true, template: false },
      defaultMode: "native" as const,
      fallbackMode: "native" as const,
    };
    const input = {
      store: { ...applied.store, receipts: [receipt] },
      policy: changedPolicy,
      appearance: null,
      actorKey: ACTOR,
      requestId: uuid(2),
      input: {
        planId: prepared.plan.planId,
        expectedPlanHash: prepared.plan.planHash,
      },
      nowMs: Date.parse(prepared.plan.expiresAt) + 1,
    };
    expect(applyAdminShell(input)).toMatchObject({
      receipt: applied.receipt,
      replayed: true,
    });
    expectCode(
      () =>
        applyAdminShell({
          ...input,
          input: { ...input.input, expectedPlanHash: "0".repeat(64) },
        }),
      "REPLAY_CONFLICT",
    );
    expectCode(
      () => applyAdminShell({ ...input, actorKey: "users:18" }),
      "PLAN_NOT_FOUND",
    );
    expect(applyAdminShell(input).store.state.revision).toBe(1);
  });

  it("isolates UUID by actor/kind and fails closed after ledger loss", () => {
    const currentPolicy = policy();
    const original = createAdminShellStore(currentPolicy);
    const prepared = prepare(original, currentPolicy, 1);
    const other = prepareAdminShell({
      store: prepared.store,
      policy: currentPolicy,
      appearance: null,
      actorKey: "users:18",
      requestId: uuid(1),
      planId: uuid(1002),
      input: select(original, currentPolicy),
      nowMs: NOW,
    });
    expect(other.replayed).toBe(false);
    expect(other.store.plans).toHaveLength(2);
    const applied = apply(prepared, currentPolicy, 1);
    expect(applied.store.receipts.map((receipt) => receipt.kind)).toEqual([
      "prepare",
      "apply",
    ]);
    expectCode(
      () =>
        apply(
          { ...prepared, store: { ...applied.store, receipts: [] } },
          currentPolicy,
          1,
        ),
      "PLAN_NOT_FOUND",
    );
    expectCode(
      () =>
        apply(
          {
            ...prepared,
            store: {
              ...applied.store,
              receipts: [],
              plans: prepared.store.plans,
            },
          },
          currentPolicy,
          1,
        ),
      "REVISION_CONFLICT",
    );
  });

  it("rejects tampered plans, duplicate identities and strict malformed commands", () => {
    const currentPolicy = policy();
    const original = createAdminShellStore(currentPolicy);
    const prepared = prepare(original, currentPolicy, 1);
    const tampered = structuredClone(prepared.store);
    tampered.plans[0].desiredMode = "template";
    expectCode(() => parseAdminShellStore(tampered), "INVALID_STORE");
    const rehashed = structuredClone(prepared.store);
    rehashed.plans[0].currentMode = "native";
    const { hash: _hash, ...content } = rehashed.plans[0];
    rehashed.plans[0].hash = hashExtensionValue(content);
    expectCode(() => parseAdminShellStore(rehashed), "INVALID_STORE");
    expectCode(
      () =>
        parseAdminShellStore({
          ...prepared.store,
          plans: [...prepared.store.plans, ...prepared.store.plans],
        }),
      "INVALID_STORE",
    );
    for (const patch of [
      { actorKey: ACTOR },
      { mode: "payload" },
      { expectedRevision: -1 },
      { expectedPolicyHash: "fake" },
    ])
      expectCode(
        () =>
          prepareAdminShell({
            store: original,
            policy: currentPolicy,
            appearance: null,
            actorKey: ACTOR,
            requestId: uuid(1),
            planId: uuid(1001),
            input: { ...select(original, currentPolicy), ...patch },
            nowMs: NOW,
          }),
        "INVALID_INPUT",
      );
    expectCode(
      () =>
        prepareAdminShell({
          store: original,
          policy: currentPolicy,
          appearance: null,
          actorKey: ACTOR,
          requestId: "00000000-0000-4000-8000-00000000000A",
          planId: uuid(1001),
          input: select(original, currentPolicy),
          nowMs: NOW,
        }),
      "INVALID_INPUT",
    );
  });

  it("bounds pending plans, prunes expired ones and retains full prepare receipts", () => {
    const currentPolicy = policy();
    let store = createAdminShellStore(currentPolicy);
    for (let seed = 1; seed <= 50; seed += 1)
      store = prepare(store, currentPolicy, seed).store;
    expectCode(() => prepare(store, currentPolicy, 51), "LIMIT_REACHED");
    const pruned = prepareAdminShell({
      store,
      policy: currentPolicy,
      appearance: null,
      actorKey: ACTOR,
      requestId: uuid(51),
      planId: uuid(1051),
      input: select(store, currentPolicy),
      nowMs: NOW + 16 * 60 * 1000,
    });
    expect(pruned.store.plans).toHaveLength(1);
    expect(pruned.store.receipts).toHaveLength(51);
    expect(pruned.store.state.revision).toBe(0);
  });

  it("bounds receipt views without discarding replay keys or imposing a lifetime-operation cap", () => {
    const currentPolicy = policy();
    const initial = prepare(
      createAdminShellStore(currentPolicy),
      currentPolicy,
      1,
    );
    const applied = apply(initial, currentPolicy, 2);
    const receipt = applied.store.receipts.find(
      (candidate) => candidate.kind === "apply",
    );
    if (!receipt || receipt.kind !== "apply")
      throw new Error("Missing fixture apply receipt");
    const bounded = structuredClone(applied.store);
    bounded.state.revision = 256;
    bounded.receipts = Array.from({ length: 256 }, (_value, index) => ({
      ...receipt,
      requestId: uuid(2000 + index),
      planId: uuid(3000 + index),
      appliedRevision: index + 1,
    }));
    const snapshot = structuredClone(bounded);
    expectCode(() => prepare(bounded, currentPolicy, 3), "LIMIT_REACHED");
    expect(bounded).toEqual(snapshot);
    const matchingOnly = prepare(
      { ...bounded, receipts: [] },
      currentPolicy,
      3,
    );
    expect(matchingOnly.plan.expectedRevision).toBe(256);
    expect(matchingOnly.store.receipts).toHaveLength(1);
    expectCode(
      () =>
        apply(
          {
            ...matchingOnly,
            store: { ...matchingOnly.store, receipts: bounded.receipts },
          },
          currentPolicy,
          4,
        ),
      "LIMIT_REACHED",
    );
  });

  it("refuses command accessors before evaluation and keeps native independent from old appearance JSON", () => {
    const currentPolicy = policy();
    const store = createAdminShellStore(currentPolicy);
    let accessed = false;
    const input = Object.defineProperty(select(store, currentPolicy), "mode", {
      enumerable: true,
      get() {
        accessed = true;
        throw new Error("must not evaluate");
      },
    });
    expectCode(
      () =>
        prepareAdminShell({
          store,
          policy: currentPolicy,
          appearance: null,
          actorKey: ACTOR,
          requestId: uuid(1),
          planId: uuid(1001),
          input,
          nowMs: NOW,
        }),
      "INVALID_INPUT",
    );
    expect(accessed).toBe(false);
    expectCode(
      () => parseAdminShellStore(createExtensionAppearanceStore()),
      "INVALID_STORE",
    );
  });

  it("reports effective fallback independently of stored choice and never overwrites it", () => {
    const currentPolicy = policy();
    const store = createAdminShellStore(currentPolicy);
    const snapshot = structuredClone(store);
    expect(
      readAdminShellState({ store, policy: currentPolicy, appearance: null }),
    ).toEqual({
      state: snapshot.state,
      effectiveMode: "native",
      requiresRecovery: true,
      fallbackReason: "template_unavailable",
    });
    expect(
      readAdminShellState({
        store,
        policy: currentPolicy,
        appearance: appearance(),
      }),
    ).toMatchObject({ effectiveMode: "template", requiresRecovery: false });
    const disabled = {
      ...currentPolicy,
      enabled: { native: true, template: false },
      defaultMode: "native" as const,
      fallbackMode: "native" as const,
    };
    expect(
      readAdminShellState({ store, policy: disabled, appearance: null }),
    ).toMatchObject({
      state: snapshot.state,
      effectiveMode: "native",
      requiresRecovery: true,
      fallbackReason: "policy_disabled",
    });
    const nativeDisabled = {
      ...currentPolicy,
      enabled: { native: false, template: true },
      fallbackMode: "template" as const,
    };
    expect(
      readAdminShellState({ store, policy: nativeDisabled, appearance: null }),
    ).toMatchObject({ effectiveMode: null, requiresRecovery: true });
    expect(store).toEqual(snapshot);
  });
});
