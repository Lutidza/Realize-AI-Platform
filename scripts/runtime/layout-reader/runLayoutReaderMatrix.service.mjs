/**
 * @file scripts/runtime/layout-reader/runLayoutReaderMatrix.service.mjs
 * @version 1.0.0
 * @date 2026-11-21
 * @description Проверяет compiled readers и pure операции на JSON fixtures без repository, HTTP или записи.
 * @see documentation/reports/2026-11-21-layout-reader-delivery-rollback-audit.md
 */
import {
  collectLayoutReaderExports,
  findCompiledBehaviorFunction,
  findCompiledFunction,
  findCompiledSchema,
} from "./discoverLayoutReaders.service.mjs";

function readerSchemas(loader, candidates, fixture, evidence) {
  const { legacy, aware } = fixture;
  const add = (name, keys, positive) =>
    evidence.push(
      findCompiledSchema(
        loader,
        candidates,
        name,
        keys,
        positive,
        positive.map((value) => ({
          ...value,
          __unknownArtifactProbeKey: true,
        })),
      ),
    );
  add(
    "assignmentSchema",
    ["selection", "settings", "manifestHash", "layout"],
    [legacy.assignment, ...Object.values(aware.assignments)],
  );
  if (loader.side === "client") {
    add(
      "catalogSchema",
      [
        "schemaVersion",
        "catalogHash",
        "runtimeBuildId",
        "hostCompatibility",
        "entries",
      ],
      [legacy.catalogDto, aware.catalogDto],
    );
    add(
      "appearancePlanDtoSchema",
      ["planId", "planHash", "desiredAssignment"],
      [legacy.prepared.plan, aware.appearance.dto.plan],
    );
    add(
      "appearanceReceiptDtoSchema",
      ["planId", "assignment", "appliedRevision"],
      [legacy.applied.receipt, aware.appearance.dto.receipt],
    );
    add(
      "shellPlanDtoSchema",
      ["planId", "planHash", "templateBinding"],
      [aware.adminShell.dto.plan],
    );
  }
  if (loader.side === "server") {
    add(
      "appearanceStoreSchema",
      ["targets", "plans", "receipts"],
      [
        legacy.initial,
        legacy.prepared.store,
        legacy.applied.store,
        aware.appearance.pending,
        aware.appearance.applied,
      ],
    );
    add(
      "appearanceReceiptSchema",
      [],
      [aware.appearance.prepareReceipt, aware.appearance.applyReceipt],
    );
    add(
      "shellStoreSchema",
      ["domain", "state", "plans", "receipts"],
      [aware.adminShell.pending, aware.adminShell.applied],
    );
    add(
      "shellReceiptSchema",
      [],
      [aware.adminShell.prepareReceipt, aware.adminShell.applyReceipt],
    );
  }
}

/** Возвращает только проверяемые утверждения; отсутствие нужного compiled export останавливает acceptance. */
export function runLayoutReaderMatrix(loader, fixture) {
  loader.setJSON("fixture", fixture);
  const candidates = collectLayoutReaderExports(loader);
  const evidence = [];
  const checks = [];
  const check = (name, expression) => {
    if (loader.evaluate(expression) !== true)
      throw new Error(`${loader.side} assertion failed: ${name}`);
    checks.push(name);
  };
  readerSchemas(loader, candidates, fixture, evidence);
  check(
    "assignment legacy JSON unchanged",
    "JSON.stringify(__probe.assignmentSchema.parse(__probe.fixture.legacy.assignment)) === JSON.stringify(__probe.fixture.legacy.assignment)",
  );
  check(
    "assignment inherited and exact pins retained",
    `Object.values(__probe.fixture.aware.assignments).every(a => JSON.stringify(__probe.assignmentSchema.parse(a).layout) === JSON.stringify(a.layout))`,
  );
  check(
    "binding invalid exact version and explicit alias rejected",
    `(() => {
    const a = structuredClone(__probe.fixture.aware.assignments.withoutTopbar);
    a.layout.reference.version = "^0.1.0";
    if (__probe.assignmentSchema.safeParse(a).success) return false;
    const b = structuredClone(__probe.fixture.aware.assignments.withoutTopbar);
    b.settings.layoutId = "default";
    if (__probe.assignmentSchema.safeParse(b).success) return false;
    const legacy = __probe.fixture.legacy.assignment;
    return !__probe.assignmentSchema.safeParse({...legacy,layout:null}).success && !__probe.assignmentSchema.safeParse({...legacy,layout:undefined}).success;
  })()`,
  );
  if (loader.side === "client") {
    check(
      "catalog layout DTO retained",
      `(() => {
    const parsed = __probe.catalogSchema.parse(__probe.fixture.aware.catalogDto);
    const actual = parsed.entries.find(e => e.layoutCatalog)?.layoutCatalog;
    const expected = __probe.fixture.aware.catalogDto.entries.find(e => e.layoutCatalog)?.layoutCatalog;
    return actual && JSON.stringify(actual) === JSON.stringify(expected);
  })()`,
    );
    check(
      "nested browser plan and receipt bindings retained",
      `(() => {
    const f = __probe.fixture.aware;
    return __probe.appearancePlanDtoSchema.parse(f.appearance.dto.plan).desiredAssignment.layout.catalogHash === f.assignments.inherited.layout.catalogHash &&
      __probe.appearanceReceiptDtoSchema.parse(f.appearance.dto.receipt).assignment.layout.catalogHash === f.assignments.inherited.layout.catalogHash &&
      __probe.shellPlanDtoSchema.parse(f.adminShell.dto.plan).templateBinding.assignment.layout.catalogHash === f.assignments.inherited.layout.catalogHash;
  })()`,
    );
    return {
      side: loader.side,
      checks,
      readers: evidence,
      discoveryFailures: candidates.failures,
    };
  }

  const fn = (name, signature) =>
    evidence.push(findCompiledFunction(loader, candidates, name, signature));
  const behavior = (name, tokens, expression) =>
    evidence.push(
      findCompiledBehaviorFunction(
        loader,
        candidates,
        name,
        tokens,
        expression,
      ),
    );
  evidence.push(
    findCompiledSchema(
      loader,
      candidates,
      "legacySettingsSchema",
      ["density", "panelWidth"],
      [fixture.legacy.settingsProbe.input],
      [fixture.legacy.settingsProbe.invalid],
    ),
  );
  evidence.push(
    findCompiledSchema(
      loader,
      candidates,
      "awareSettingsSchema",
      ["density", "panelWidth", "layoutId"],
      [
        fixture.aware.settingsProbe.input,
        fixture.aware.settingsProbe.withoutTopbar.input,
      ],
      [fixture.aware.settingsProbe.invalid],
    ),
  );
  loader.evaluate(
    "__probe.legacySettings = __probe.legacySettingsSchema.parse; __probe.awareSettings = __probe.awareSettingsSchema.parse",
  );
  loader.evaluate(`for (const name of ["legacy", "aware"]) {
    for (const entry of __probe.fixture[name].catalog.entries)
      entry.resolveSettings = entry.manifest.id === "realize" ? __probe.legacySettings : __probe.awareSettings;
  }`);
  fn("hashValue", {
    all: ["sha256", "getOwnPropertyDescriptors", "INVALID_INPUT"],
  });
  fn("createCatalog", {
    all: [
      "INVALID_CATALOG",
      "hostCompatibility",
      "manifestHash",
      "layoutCatalog",
    ],
  });
  behavior(
    "parseAppearanceStore",
    ["INVALID_STORE", "receipts"],
    `(() => {
    const f = __probe.fixture.aware.appearance.pending;
    const parsed = __probe.candidateFunction(f);
    return parsed.targets?.admin.current?.layout?.catalogHash === f.targets.admin.current.layout.catalogHash;
  })()`,
  );
  behavior(
    "parseShellStore",
    ["INVALID_STORE", "receipts"],
    `(() => {
    const f = __probe.fixture.aware.adminShell.pending;
    const parsed = __probe.candidateFunction(f);
    return parsed.domain === "admin-shell" && parsed.plans[0].templateBinding.assignment.layout.catalogHash === f.plans[0].templateBinding.assignment.layout.catalogHash;
  })()`,
  );
  fn("prepareAppearance", {
    all: [
      "desiredAssignment",
      "expectedCatalogHash",
      "PLAN_EXPIRED",
      "REPLAY_CONFLICT",
    ],
  });
  fn("applyAppearance", {
    all: ["desiredAssignment", "PLAN_NOT_FOUND", "PLAN_HASH_MISMATCH"],
  });
  fn("prepareShell", {
    all: [
      "templateBinding",
      "expectedPolicyHash",
      "PLAN_EXPIRED",
      "REPLAY_CONFLICT",
    ],
  });
  fn("applyShell", {
    all: ["desiredMode", "PLAN_NOT_FOUND", "PLAN_HASH_MISMATCH"],
  });
  fn("resolveAssignment", {
    all: ["manifestHash", "INVALID_SETTINGS", "layoutCatalog", "selection"],
    exclude: ["expectedCatalogHash"],
  });
  fn("inventoryIssue", {
    all: ["invalid_assignment", "not_compiled", "manifestHash"],
  });

  check(
    "server compiled catalog compiler retains exact layout catalog",
    `(() => {
    for (const name of ["legacy", "aware"]) {
      const f = __probe.fixture[name];
      const entries = f.catalog.entries.map(entry => ({manifest:entry.manifest,settingsSchema:entry.settingsSchema,resolveSettings:entry.resolveSettings,
        ...(entry.readiness === undefined ? {} : {readiness:entry.readiness}),
        ...(entry.layoutCatalog === undefined ? {} : {layouts:{templateIdentity:entry.layoutCatalog.template.identity,catalog:entry.layoutCatalog}})}));
      const compiled = __probe.createCatalog({entries,hostCompatibility:f.catalog.hostCompatibility,runtimeBuildId:f.catalog.runtimeBuildId});
      if (compiled.catalogHash !== f.catalog.catalogHash || __probe.hashValue(JSON.parse(JSON.stringify(compiled))) !== __probe.hashValue(JSON.parse(JSON.stringify(f.catalog)))) return false;
    }
    return true;
  })()`,
  );

  check(
    "server nested stores and independent ledger receipt readers",
    `(() => {
    const f = __probe.fixture.aware;
    const a = __probe.parseAppearanceStore(f.appearance.applied);
    const s = __probe.parseShellStore(f.adminShell.pending);
    return a.targets.admin.previous.layout.catalogHash === f.assignments.inherited.layout.catalogHash &&
      __probe.appearanceReceiptSchema.parse(f.appearance.prepareReceipt).plan.desiredAssignment.layout.catalogHash === f.assignments.inherited.layout.catalogHash &&
      __probe.appearanceReceiptSchema.parse(f.appearance.applyReceipt).assignment.layout.catalogHash === f.assignments.inherited.layout.catalogHash &&
      __probe.shellReceiptSchema.parse(f.adminShell.prepareReceipt).plan.templateBinding.assignment.layout.catalogHash === f.assignments.inherited.layout.catalogHash &&
      s.plans[0].templateBinding.assignment.layout.catalogHash === f.assignments.inherited.layout.catalogHash;
  })()`,
  );
  check(
    "stored pending and ledger plan hash tampering rejected",
    `(() => {
    for (const [name, parser] of [["appearance", __probe.parseAppearanceStore], ["adminShell", __probe.parseShellStore]]) {
      for (const place of ["pending", "ledger"]) {
        const copy = structuredClone(__probe.fixture.aware[name].pending);
        if (place === "pending") copy.plans[0].expiresAt = "2099-01-01T00:00:00.000Z";
        else copy.receipts[0].plan.expiresAt = "2099-01-01T00:00:00.000Z";
        try { parser(copy); return false; } catch (error) { if (error.code !== "INVALID_STORE") return false; }
      }
    }
    return true;
  })()`,
  );
  check(
    "legacy golden hashes retained",
    `(() => {
    const f = __probe.fixture.legacy, h = __probe.hashValue;
    const values = {catalog:f.catalog.catalogHash, manifest:f.assignment.manifestHash, assignment:h(f.assignment), plan:f.prepared.plan.planHash,
      planDto:h(f.prepared.plan), prepareReceipt:h(f.prepared.store.receipts[0]), applyDto:h(f.applied.receipt), appliedStore:h(f.applied.store)};
    return Object.keys(f.goldens).every(k => values[k] === f.goldens[k]);
  })()`,
  );
  check(
    "legacy fresh prepare and apply reproduce historical golden outputs",
    `(() => {
    const f = __probe.fixture.legacy;
    const preparation = structuredClone(f.replay.prepare);
    preparation.store = structuredClone(f.initial); preparation.catalog=f.catalog; preparation.nowMs=f.context.nowMs;
    const prepared = __probe.prepareAppearance(preparation);
    const application=structuredClone(f.replay.apply);
    application.store=prepared.store; application.catalog=f.catalog; application.nowMs=f.context.nowMs+1000;
    const applied=__probe.applyAppearance(application);
    return !prepared.replayed && !applied.replayed && prepared.plan.planHash===f.goldens.plan && __probe.hashValue(prepared.plan)===f.goldens.planDto &&
      __probe.hashValue(applied.receipt)===f.goldens.applyDto && __probe.hashValue(applied.store)===f.goldens.appliedStore;
  })()`,
  );
  check(
    "exact resolver preserves inherit and explicit choices",
    `(() => {
    const f = __probe.fixture.aware;
    return Object.values(f.assignments).every(a => {
      const resolved = __probe.resolveAssignment({catalog:f.catalog, target:"admin", selection:a.selection, settings:a.settings});
      return __probe.hashValue(resolved) === __probe.hashValue(a);
    });
  })()`,
  );
  check(
    "inventory rejects missing and mismatched exact pin",
    `__probe.fixture.aware.inventory.every(p => __probe.inventoryIssue(__probe.fixture.aware.catalog,"admin",p.assignment) === p.expectedIssue)`,
  );
  for (const mode of ["legacy", "aware"]) {
    const section =
      mode === "legacy"
        ? "__probe.fixture.legacy"
        : "__probe.fixture.aware.appearance";
    for (const operation of ["prepare", "apply"]) {
      check(
        `${mode} appearance ${operation} replay without mutation`,
        `(() => {
        const f = ${section}, input = structuredClone(f.replay.${operation});
        input.catalog = __probe.fixture.${mode}.catalog;
        const before = JSON.stringify(input.store), allBefore = JSON.stringify(input);
        const result = __probe.${operation === "prepare" ? "prepareAppearance" : "applyAppearance"}(input);
        return result.replayed === true && JSON.stringify(result.store) === before && JSON.stringify(input) === allBefore;
      })()`,
      );
    }
  }
  for (const operation of ["prepare", "apply"]) {
    check(
      `admin shell ${operation} replay without mutation`,
      `(() => {
      const input = structuredClone(__probe.fixture.aware.adminShell.replay.${operation});
      if (input.appearance) input.appearance.catalog = __probe.fixture.aware.catalog;
      const before = JSON.stringify(input.store), allBefore = JSON.stringify(input);
      const result = __probe.${operation === "prepare" ? "prepareShell" : "applyShell"}(input);
      return result.replayed === true && JSON.stringify(result.store) === before && JSON.stringify(input) === allBefore;
    })()`,
    );
  }
  for (const [name, target] of [
    ["appearancePrepare", "prepareAppearance"],
    ["appearanceApply", "applyAppearance"],
    ["adminShellPrepare", "prepareShell"],
    ["adminShellApply", "applyShell"],
  ]) {
    check(
      `${name} default writer disabled and input unchanged`,
      `(() => {
      const input = structuredClone(__probe.fixture.gates.${name});
      if (Object.hasOwn(input,"layoutAssignmentWrites")) return false;
      ${name.startsWith("appearance") ? "input.catalog = __probe.fixture.aware.catalog;" : "if(input.appearance) input.appearance.catalog = __probe.fixture.aware.catalog;"}
      const before = JSON.stringify(input);
      try { __probe.${target}(input); return false; }
      catch(error) { return error.code === __probe.fixture.gates.expectedCode && JSON.stringify(input) === before; }
    })()`,
    );
  }
  return {
    side: loader.side,
    checks,
    readers: evidence,
    discoveryFailures: candidates.failures,
  };
}
