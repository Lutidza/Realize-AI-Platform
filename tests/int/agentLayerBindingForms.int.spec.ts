/**
 * @file tests/int/agentLayerBindingForms.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет формы связей, неизменность aggregate и точную семантику системных ограничений.
 */

import { describe, expect, it } from "vitest";
import type {
  AICapabilityBindingDefinition,
  AICheckBindingDefinition,
  AIConfigDraftDTO,
} from "@realize/ai-contracts";
import {
  assertAIConfigArtifactRevisions,
  compileAgentConfiguration,
  createAIConfigRelease,
  SYSTEM_AI_CONFIG_PROJECTION,
  validateAIConfigDraftForSystem,
} from "@realize/change-engine";
import type {
  AgentLayerBindingArtifact,
  AgentLayerBindingInput,
} from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerBinding.types";
import { buildAgentLayerBindingUpdate } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/buildAgentLayerBindingUpdate.mapper";
import { createAgentLayerBindingCopy } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/createAgentLayerBindingCopy.util";
import { getAgentLayerBindingFields } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerBindingFields.util";
import { isAgentLayerBindingArtifact } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/isAgentLayerBindingArtifact.util";
import { validateAgentLayerBindingInput } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/validateAgentLayerBindingInput.validator";
import { agentLayerDraft } from "./fixtures/agentLayerConfiguration";

const capability: AICapabilityBindingDefinition = {
  kind: "capability_binding",
  key: "binding.same",
  title: "Назначение категории",
  enabled: true,
  revision: 4,
  capability: { id: "catalog.assignCategory.v1", version: "1.0" },
  allowedActions: ["category.assign"],
};
const check: AICheckBindingDefinition = {
  kind: "check_binding",
  key: "binding.same",
  title: "Проверка доступа",
  enabled: true,
  revision: 7,
  checkID: "payload.access",
};
const sources: readonly AgentLayerBindingArtifact[] = [capability, check];
const draft: AIConfigDraftDTO = {
  ...agentLayerDraft,
  artifacts: [...agentLayerDraft.artifacts, ...sources],
};

const selectedDraft = (
  selected: AgentLayerBindingArtifact,
): AIConfigDraftDTO => ({
  ...agentLayerDraft,
  artifacts: [
    ...agentLayerDraft.artifacts.map((artifact) =>
      artifact.kind === "agent_profile"
        ? {
            ...artifact,
            capabilityBindingKeys:
              selected.kind === "capability_binding" ? [selected.key] : [],
            checkBindingKeys:
              selected.kind === "check_binding" ? [selected.key] : [],
          }
        : artifact,
    ),
    selected,
  ],
});

describe("binding aggregate updates", () => {
  it.each(sources)(
    "updates only $kind with exact CAS, lineage and monotonic revision",
    (source) => {
      const before = structuredClone(draft);
      const input = {
        ...getAgentLayerBindingFields(source),
        title: "Новое название",
        enabled: false,
      };
      const updated = buildAgentLayerBindingUpdate(draft, input, source.key);
      expect(updated.expectedRevision).toBe(draft.revision);
      expect(updated.baseRelease).toEqual(draft.baseRelease);
      expect(
        updated.artifacts.filter(
          (item) => item.kind !== source.kind || item.key !== source.key,
        ),
      ).toEqual(
        draft.artifacts.filter(
          (item) => item.kind !== source.kind || item.key !== source.key,
        ),
      );
      expect(
        updated.artifacts.find(
          (item) => item.kind === source.kind && item.key === source.key,
        ),
      ).toEqual({
        ...source,
        title: input.title,
        enabled: false,
        revision: source.revision + 1,
      });
      expect(() =>
        assertAIConfigArtifactRevisions({
          current: draft,
          artifacts: updated.artifacts,
        }),
      ).not.toThrow();
      expect(draft).toEqual(before);
    },
  );

  it.each(sources)(
    "keeps no-op $kind revision and omits non-form metadata",
    (source) => {
      const fields = getAgentLayerBindingFields({
        ...source,
        extra: "ignored",
      } as unknown as AgentLayerBindingArtifact);
      expect(fields).not.toHaveProperty("revision");
      expect(fields).not.toHaveProperty("extra");
      const reordered = Object.fromEntries(
        Object.entries(fields).reverse(),
      ) as AgentLayerBindingInput;
      expect(
        buildAgentLayerBindingUpdate(draft, reordered, source.key).artifacts,
      ).toEqual(draft.artifacts);
    },
  );

  it.each(sources)(
    "creates $kind at revision one and rejects duplicate, missing or renamed identity",
    (source) => {
      const fields = getAgentLayerBindingFields(source);
      const otherKinds = {
        ...draft,
        artifacts: draft.artifacts.filter(
          (item) => item.kind !== source.kind || item.key !== source.key,
        ),
      };
      expect(
        buildAgentLayerBindingUpdate(otherKinds, fields).artifacts.at(-1),
      ).toMatchObject({
        kind: source.kind,
        key: source.key,
        revision: 1,
      });
      expect(() => buildAgentLayerBindingUpdate(draft, fields)).toThrow(
        "уже существует",
      );
      expect(() =>
        buildAgentLayerBindingUpdate(otherKinds, fields, source.key),
      ).toThrow("больше не найден");
      expect(() =>
        buildAgentLayerBindingUpdate(
          draft,
          { ...fields, key: "renamed" },
          source.key,
        ),
      ).toThrow("не меняется");
    },
  );

  it.each(sources)(
    "rejects read-only $kind changes and accepts ready drafts",
    (source) => {
      const fields = { ...getAgentLayerBindingFields(source), enabled: false };
      for (const state of ["released", "validating"] as const)
        expect(() =>
          buildAgentLayerBindingUpdate({ ...draft, state }, fields, source.key),
        ).toThrow("только для чтения");
      expect(
        buildAgentLayerBindingUpdate(
          { ...draft, state: "ready" },
          fields,
          source.key,
        ).artifacts,
      ).toHaveLength(draft.artifacts.length);
    },
  );

  it("preserves omitted scopes, explicit denial and explicit limits across no-op and changed updates", () => {
    const source = {
      ...capability,
      readScopes: [],
      writeScopes: ["payload.products.categories"],
      maxTargets: 1,
    };
    const current = { ...draft, artifacts: [source] };
    const fields = getAgentLayerBindingFields(source);
    if (fields.kind !== "capability_binding")
      throw new Error("Unexpected fixture kind");
    expect(fields.maxTargets).toBe("1");
    expect(
      buildAgentLayerBindingUpdate(current, fields, source.key).artifacts,
    ).toEqual([source]);
    const updated = buildAgentLayerBindingUpdate(
      current,
      {
        ...fields,
        readScopes: undefined,
        writeScopes: [],
        maxTargets: "",
      },
      source.key,
    );
    expect(updated.artifacts[0]).toEqual({
      ...capability,
      revision: source.revision + 1,
      writeScopes: [],
    });
    expect(updated.artifacts[0]).not.toHaveProperty("readScopes");
    expect(updated.artifacts[0]).not.toHaveProperty("maxTargets");
  });

  it("rejects extra input fields and aggregate overflow at the canonical parser", () => {
    expect(() =>
      buildAgentLayerBindingUpdate(
        draft,
        {
          ...getAgentLayerBindingFields(capability),
          executor: "untrusted.command",
        } as unknown as AgentLayerBindingInput,
        capability.key,
      ),
    ).toThrow("unsupported");
    const fields = getAgentLayerBindingFields(capability);
    if (fields.kind !== "capability_binding")
      throw new Error("Unexpected fixture kind");
    expect(() =>
      buildAgentLayerBindingUpdate(
        draft,
        {
          ...fields,
          capability: { ...fields.capability, command: "untrusted.command" },
        } as AgentLayerBindingInput,
        capability.key,
      ),
    ).toThrow("unsupported");
    const full = {
      ...draft,
      artifacts: Array.from({ length: 512 }, (_, index) => ({
        ...check,
        key: `check-${index}`,
        revision: 1,
      })),
    };
    expect(() => buildAgentLayerBindingUpdate(full, fields)).toThrow("512");
  });
});

describe("binding fields and local validation", () => {
  it.each(sources)(
    "creates detached $kind fields with no implicit system target",
    (source) => {
      const empty = getAgentLayerBindingFields(source.kind);
      expect(empty).toMatchObject({
        kind: source.kind,
        key: "",
        title: "",
        enabled: true,
      });
      expect(validateAgentLayerBindingInput(empty)).toBeTypeOf("string");
      if (empty.kind === "capability_binding")
        expect(empty).toEqual({
          ...empty,
          capability: { id: "", version: "" },
          maxTargets: "",
          allowedActions: [],
        });
      else expect(empty.checkID).toBe("");
      expect(
        validateAgentLayerBindingInput(getAgentLayerBindingFields(source)),
      ).toBeUndefined();
    },
  );

  it("classifies only bindings and clones exact reference and all optional arrays", () => {
    expect(sources.map(isAgentLayerBindingArtifact)).toEqual([true, true]);
    expect(agentLayerDraft.artifacts.some(isAgentLayerBindingArtifact)).toBe(
      false,
    );
    const source = {
      ...capability,
      readScopes: ["payload.products"],
      writeScopes: [],
    };
    const fields = getAgentLayerBindingFields(source);
    if (fields.kind !== "capability_binding")
      throw new Error("Unexpected fixture kind");
    expect(fields.capability).not.toBe(source.capability);
    expect(fields.allowedActions).not.toBe(source.allowedActions);
    expect(fields.readScopes).not.toBe(source.readScopes);
    expect(fields.writeScopes).not.toBe(source.writeScopes);
  });

  it.each(sources)(
    "enforces shared key, title and enabled fields for $kind",
    (source) => {
      const fields = getAgentLayerBindingFields(source);
      expect(
        validateAgentLayerBindingInput({
          ...fields,
          key: "x".repeat(128),
          title: "я".repeat(120),
        }),
      ).toBeUndefined();
      for (const change of [
        { key: "" },
        { key: "bad key" },
        { key: ".invalid" },
        { key: "x".repeat(129) },
        { title: " " },
        { title: "я".repeat(121) },
        { enabled: "true" },
      ])
        expect(
          validateAgentLayerBindingInput({
            ...fields,
            ...change,
          } as AgentLayerBindingInput),
        ).toBeTypeOf("string");
    },
  );

  it("requires exact numeric versions and stable check identifiers without guessing missing targets", () => {
    const fields = getAgentLayerBindingFields(capability);
    if (fields.kind !== "capability_binding")
      throw new Error("Unexpected fixture kind");
    for (const version of ["1.0", "1.0.0", "23.14.8"])
      expect(
        validateAgentLayerBindingInput({
          ...fields,
          capability: { id: "missing.capability", version },
        }),
      ).toBeUndefined();
    for (const version of ["", "latest", "^1.0", "1", "1.0-beta", "1.0.0.0"])
      expect(
        validateAgentLayerBindingInput({
          ...fields,
          capability: { ...fields.capability, version },
        }),
      ).toContain("точной");
    const checkFields = getAgentLayerBindingFields(check);
    if (checkFields.kind !== "check_binding")
      throw new Error("Unexpected fixture kind");
    expect(
      validateAgentLayerBindingInput({
        ...checkFields,
        checkID: "missing.check",
        enabled: false,
      }),
    ).toBeUndefined();
    for (const checkID of ["", "bad check", "x".repeat(129)])
      expect(
        validateAgentLayerBindingInput({ ...checkFields, checkID }),
      ).toContain("проверку");
  });

  it("keeps raw invalid numbers and accepts only positive safe integer input or explicit inheritance", () => {
    const fields = getAgentLayerBindingFields(capability);
    if (fields.kind !== "capability_binding")
      throw new Error("Unexpected fixture kind");
    for (const maxTargets of ["", "1", "001", String(Number.MAX_SAFE_INTEGER)])
      expect(
        validateAgentLayerBindingInput({ ...fields, maxTargets }),
      ).toBeUndefined();
    for (const maxTargets of [
      "0",
      "-1",
      "1.5",
      "1e2",
      "Infinity",
      "NaN",
      " ",
      " 1",
      "+1",
      "1.0",
      "9007199254740992",
    ])
      expect(() =>
        buildAgentLayerBindingUpdate(
          draft,
          { ...fields, maxTargets },
          capability.key,
        ),
      ).toThrow("Лимит объектов");
    const updated = buildAgentLayerBindingUpdate(
      draft,
      { ...fields, maxTargets: "001" },
      capability.key,
    );
    expect(
      updated.artifacts.find(
        (artifact) => artifact.kind === "capability_binding",
      ),
    ).toMatchObject({ maxTargets: 1 });
    expect(fields.maxTargets).toBe("");
  });

  it.each(["allowedActions", "readScopes", "writeScopes"] as const)(
    "bounds %s without dropping unknown or reordered values",
    (field) => {
      const fields = getAgentLayerBindingFields(capability);
      if (fields.kind !== "capability_binding")
        throw new Error("Unexpected fixture kind");
      const values = Array.from(
        { length: 128 },
        (_, index) => `unknown-${index}`,
      );
      expect(
        validateAgentLayerBindingInput({ ...fields, [field]: values }),
      ).toBeUndefined();
      expect(
        validateAgentLayerBindingInput({ ...fields, [field]: [] }),
      ).toBeUndefined();
      for (const invalid of [
        [...values, "overflow"],
        ["duplicate", "duplicate"],
        [""],
        ["bad key"],
        ["x".repeat(129)],
      ])
        expect(
          validateAgentLayerBindingInput({ ...fields, [field]: invalid }),
        ).toBeTypeOf("string");
      const ordered = ["second", "first"];
      expect(
        buildAgentLayerBindingUpdate(
          draft,
          { ...fields, [field]: ordered },
          capability.key,
        ).artifacts.find((artifact) => artifact.kind === "capability_binding"),
      ).toMatchObject({ [field]: ordered });
    },
  );
});

describe("binding draft semantics and system compilation", () => {
  it("allows an unfinished draft action selection and reports the semantic error separately", () => {
    const fields = getAgentLayerBindingFields(capability);
    if (fields.kind !== "capability_binding")
      throw new Error("Unexpected fixture kind");
    const current = selectedDraft(capability);
    const update = buildAgentLayerBindingUpdate(
      current,
      { ...fields, allowedActions: [] },
      capability.key,
    );
    const validation = validateAIConfigDraftForSystem({
      draft: { ...current, artifacts: update.artifacts },
      system: SYSTEM_AI_CONFIG_PROJECTION,
    });
    expect(validation.valid).toBe(false);
    expect(
      validation.issues.some(
        (issue) => issue.code === "config_capability_actions_empty",
      ),
    ).toBe(true);
  });

  it.each([
    { ...capability, capability: { ...capability.capability, version: "9.0" } },
    { ...capability, allowedActions: ["category.delete"] },
    { ...capability, readScopes: ["payload.secrets"] },
    { ...capability, writeScopes: ["payload.products"] },
    { ...capability, maxTargets: 2 },
    { ...check, checkID: "missing.check" },
  ])(
    "keeps structurally valid $kind draft content while the enabled profile rejects an unavailable ceiling",
    (source) => {
      const current = selectedDraft(source);
      const update = buildAgentLayerBindingUpdate(
        current,
        getAgentLayerBindingFields(source),
        source.key,
      );
      const validation = validateAIConfigDraftForSystem({
        draft: { ...current, artifacts: update.artifacts },
        system: SYSTEM_AI_CONFIG_PROJECTION,
      });
      expect(validation.valid).toBe(false);
      expect(
        validation.issues.some(
          (issue) => issue.code === "config_system_policy_invalid",
        ),
      ).toBe(true);
    },
  );

  it.each([false, true])(
    "preserves scope inheritance versus explicit denial in compiled output: deny=%s",
    (deny) => {
      const source = deny
        ? { ...capability, readScopes: [], writeScopes: [] }
        : capability;
      const current = selectedDraft(source);
      const update = buildAgentLayerBindingUpdate(
        current,
        getAgentLayerBindingFields(source),
        source.key,
      );
      const release = createAIConfigRelease({
        draft: { ...current, artifacts: update.artifacts, state: "ready" },
        createdAt: "2026-09-10T10:00:00.000Z",
        createdBy: "fixture",
        releaseID: "release-binding-test",
        releaseVersion: 1,
        systemCompatibility: {
          minimumRelease: SYSTEM_AI_CONFIG_PROJECTION.version,
        },
      });
      const compiled = compileAgentConfiguration({
        profileKey: "local.agent",
        release,
        system: SYSTEM_AI_CONFIG_PROJECTION,
      });
      expect(compiled.capabilities[0]).toMatchObject({
        capability: capability.capability,
        actions: capability.allowedActions,
        maxTargets: 1,
        readScopes: deny ? [] : ["payload.categories", "payload.products"],
        writeScopes: deny ? [] : ["payload.products.categories"],
      });
      expect(compiled.checkIDs).toEqual(
        [...SYSTEM_AI_CONFIG_PROJECTION.checkIDs].sort(),
      );
    },
  );
});

describe("binding copies", () => {
  it.each(sources)(
    "copies $kind with a unique identity and initial revision only on save",
    (source) => {
      const before = structuredClone(source);
      const copy = createAgentLayerBindingCopy(source, draft.artifacts);
      expect(copy).toEqual({
        ...getAgentLayerBindingFields(source),
        key: `${source.key}.copy`,
        title: `${source.title} (копия)`,
      });
      if (copy.kind === "capability_binding") {
        copy.capability.version = "9.0";
        (copy.allowedActions as string[]).push("only.copy");
      }
      expect(source).toEqual(before);
      const updated = buildAgentLayerBindingUpdate(draft, copy);
      expect(updated.artifacts.at(-1)).toMatchObject({
        kind: source.kind,
        key: copy.key,
        revision: 1,
      });
      expect(updated.artifacts.slice(0, -1)).toEqual(draft.artifacts);
    },
  );

  it("keeps optional arrays detached and bounds suffixes within the same kind", () => {
    const source = {
      ...capability,
      key: "x".repeat(128),
      title: "Я".repeat(120),
      readScopes: [],
      writeScopes: ["payload.products.categories"],
      maxTargets: 1,
    };
    const firstKey = `${source.key.slice(0, 123)}.copy`;
    const secondKey = `${source.key.slice(0, 121)}.copy-2`;
    const copy = createAgentLayerBindingCopy(source, [
      source,
      { ...source, key: firstKey },
      { ...check, key: secondKey },
    ]);
    expect(copy.key).toBe(secondKey);
    expect(copy.key).toHaveLength(128);
    expect(copy.title).toHaveLength(120);
    expect(copy.title.endsWith(" (копия)")).toBe(true);
    if (copy.kind !== "capability_binding")
      throw new Error("Unexpected fixture kind");
    expect(copy.maxTargets).toBe("1");
    expect(copy.readScopes).toEqual([]);
    expect(copy.readScopes).not.toBe(source.readScopes);
    expect(copy.writeScopes).not.toBe(source.writeScopes);
    expect(validateAgentLayerBindingInput(copy)).toBeUndefined();
  });
});
