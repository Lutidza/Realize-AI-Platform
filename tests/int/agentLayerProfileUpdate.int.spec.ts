/**
 * @file tests/int/agentLayerProfileUpdate.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет профильные поля, точные revisions, сохранение aggregate и независимые копии.
 */

import { describe, expect, it } from "vitest";
import type {
  AIAgentProfileDefinition,
  AIConfigDraftDTO,
} from "@realize/ai-contracts";
import { assertAIConfigArtifactRevisions } from "@realize/change-engine";
import type { AgentLayerProfileInput } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerConfiguration.types";
import { buildAgentLayerProfileUpdate } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/buildAgentLayerProfileUpdate.mapper";
import { createAgentLayerProfileCopy } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/createAgentLayerProfileCopy.util";
import { getAgentLayerProfileFields } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerProfileFields.util";
import { validateAgentLayerProfileInput } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/validateAgentLayerProfileInput.validator";
import {
  agentLayerDraft,
  agentLayerRule,
} from "./fixtures/agentLayerConfiguration";

const profile = agentLayerDraft.artifacts.find(
  (artifact): artifact is AIAgentProfileDefinition =>
    artifact.kind === "agent_profile",
)!;
const fields = getAgentLayerProfileFields(profile);
const referenceFields = [
  "capabilityBindingKeys",
  "checkBindingKeys",
  "promptTemplateKeys",
  "roleKeys",
  "ruleKeys",
  "skillKeys",
  "workflowKeys",
] as const;

describe("agent profile aggregate updates", () => {
  it.each([
    { title: "Новое название" },
    { description: "Новое назначение" },
    { locale: "en-US" },
    { enabled: false },
    { capabilityBindingKeys: ["capability"] },
    { checkBindingKeys: ["check"] },
    { promptTemplateKeys: ["prompt"] },
    { roleKeys: ["role"] },
    { ruleKeys: ["rule"] },
    { skillKeys: ["skill"] },
    { workflowKeys: ["workflow"] },
    { workflowKeys: ["workflow"], defaultWorkflowKey: "workflow" },
  ] satisfies Partial<AgentLayerProfileInput>[])(
    "changes only the profile and its revision for %j",
    (change) => {
      const original = structuredClone(agentLayerDraft);
      const updated = buildAgentLayerProfileUpdate(
        agentLayerDraft,
        { ...fields, ...change },
        profile.key,
      );
      expect(updated.expectedRevision).toBe(agentLayerDraft.revision);
      expect(updated.schemaVersion).toBe("1.0");
      expect(updated.baseRelease).toEqual(agentLayerDraft.baseRelease);
      expect(updated.artifacts.slice(0, 2)).toEqual(
        agentLayerDraft.artifacts.slice(0, 2),
      );
      expect(updated.artifacts[2]).toMatchObject({
        ...change,
        revision: profile.revision + 1,
      });
      expect(() =>
        assertAIConfigArtifactRevisions({
          artifacts: updated.artifacts,
          current: agentLayerDraft,
        }),
      ).not.toThrow();
      expect(agentLayerDraft).toEqual(original);
    },
  );

  it("keeps the revision when only input object field order changes", () => {
    const reordered = Object.fromEntries(
      Object.entries(fields).reverse(),
    ) as AgentLayerProfileInput;
    const updated = buildAgentLayerProfileUpdate(
      agentLayerDraft,
      reordered,
      profile.key,
    );
    expect(updated.artifacts[2]).toEqual(profile);
    expect(() =>
      assertAIConfigArtifactRevisions({
        artifacts: updated.artifacts,
        current: agentLayerDraft,
      }),
    ).not.toThrow();
  });

  it("treats reference order as changed content and can remove the default workflow", () => {
    const previous = {
      ...profile,
      workflowKeys: ["first", "second"],
      defaultWorkflowKey: "first",
    };
    const draft = { ...agentLayerDraft, artifacts: [previous] };
    const input = getAgentLayerProfileFields(previous);
    delete input.defaultWorkflowKey;
    const updated = buildAgentLayerProfileUpdate(
      draft,
      { ...input, workflowKeys: ["second", "first"] },
      profile.key,
    );
    expect(updated.artifacts[0].revision).toBe(profile.revision + 1);
    expect(updated.artifacts[0]).not.toHaveProperty("defaultWorkflowKey");
    expect(() =>
      assertAIConfigArtifactRevisions({
        artifacts: updated.artifacts,
        current: draft,
      }),
    ).not.toThrow();
  });

  it("starts new identity at one and allows a key already owned by another kind", () => {
    const updated = buildAgentLayerProfileUpdate(agentLayerDraft, {
      ...fields,
      key: agentLayerRule.key,
    });
    expect(updated.artifacts.at(-1)).toMatchObject({
      kind: "agent_profile",
      key: agentLayerRule.key,
      revision: 1,
    });
    expect(updated.artifacts.slice(0, -1)).toEqual(agentLayerDraft.artifacts);
    expect(() =>
      assertAIConfigArtifactRevisions({
        artifacts: updated.artifacts,
        current: agentLayerDraft,
      }),
    ).not.toThrow();
    expect(
      buildAgentLayerProfileUpdate(
        { ...agentLayerDraft, baseRelease: undefined },
        { ...fields, key: "new-profile" },
      ).baseRelease,
    ).toBeNull();
  });

  it("rejects a duplicate profile, a missing original, and renaming a saved profile", () => {
    expect(() => buildAgentLayerProfileUpdate(agentLayerDraft, fields)).toThrow(
      "уже существует",
    );
    expect(() =>
      buildAgentLayerProfileUpdate(
        agentLayerDraft,
        { ...fields, key: "missing" },
        "missing",
      ),
    ).toThrow("больше не найден");
    expect(() =>
      buildAgentLayerProfileUpdate(
        agentLayerDraft,
        { ...fields, key: "renamed" },
        profile.key,
      ),
    ).toThrow("не меняется");
  });

  it.each(["released", "validating"] as const)(
    "blocks changes to %s drafts",
    (state) => {
      expect(() =>
        buildAgentLayerProfileUpdate(
          { ...agentLayerDraft, state },
          fields,
          profile.key,
        ),
      ).toThrow("только для чтения");
    },
  );

  it("permits ready drafts and keeps incomplete references for separate server validation", () => {
    const input = {
      ...fields,
      ruleKeys: ["missing-rule"],
      roleKeys: ["disabled-role"],
    };
    const draft: AIConfigDraftDTO = {
      ...agentLayerDraft,
      state: "ready",
      artifacts: [
        ...agentLayerDraft.artifacts,
        {
          kind: "local_role",
          key: "disabled-role",
          title: "Отключённая роль",
          enabled: false,
          revision: 1,
          instructions: "Инструкции",
          capabilityBindingKeys: [],
        },
      ],
    };
    expect(validateAgentLayerProfileInput(input)).toBeUndefined();
    const updated = buildAgentLayerProfileUpdate(draft, input, profile.key);
    expect(updated.artifacts[2]).toMatchObject(input);
    expect(updated.artifacts.at(-1)).toEqual(draft.artifacts.at(-1));
  });

  it("enforces aggregate record and serialized body limits before sending", () => {
    const full = {
      ...agentLayerDraft,
      artifacts: Array.from({ length: 512 }, (_, index) => ({
        ...agentLayerRule,
        key: `rule-${index}`,
        revision: 1,
      })),
    };
    expect(() => buildAgentLayerProfileUpdate(full, fields)).toThrow("512");
    const large = {
      ...agentLayerDraft,
      artifacts: Array.from({ length: 300 }, (_, index) => ({
        ...agentLayerRule,
        key: `rule-${index}`,
        instruction: "x".repeat(8000),
        revision: 1,
      })),
    };
    expect(() => buildAgentLayerProfileUpdate(large, fields)).toThrow(
      "2000000",
    );
  });
});

describe("agent profile field validation", () => {
  it.each([
    { key: "" },
    { key: "bad key" },
    { key: "x".repeat(129) },
    { title: " " },
    { title: "x".repeat(121) },
    { description: "\n " },
    { description: "x".repeat(2001) },
    { locale: "r" },
    { locale: "en_US" },
    { locale: "zh-Hant-TW" },
    { defaultWorkflowKey: "" },
    { defaultWorkflowKey: "unselected" },
  ] satisfies Partial<AgentLayerProfileInput>[])(
    "rejects invalid profile fields %j",
    (change) => {
      const input = { ...fields, ...change };
      expect(validateAgentLayerProfileInput(input)).toBeTypeOf("string");
      expect(() =>
        buildAgentLayerProfileUpdate(agentLayerDraft, input, profile.key),
      ).toThrow();
    },
  );

  it.each(["ru", "ru-RU", "en-US", "zh-Hant", "eng"])(
    "accepts the supported locale %s and text maxima",
    (locale) => {
      expect(
        validateAgentLayerProfileInput({
          ...fields,
          key: "x".repeat(128),
          title: "x".repeat(120),
          description: "x".repeat(2000),
          locale,
        }),
      ).toBeUndefined();
    },
  );

  it.each(referenceFields)(
    "enforces bounds, stable keys and uniqueness for %s",
    (field) => {
      const values = Array.from({ length: 128 }, (_, index) => `item-${index}`);
      expect(
        validateAgentLayerProfileInput({ ...fields, [field]: values }),
      ).toBeUndefined();
      expect(
        validateAgentLayerProfileInput({
          ...fields,
          [field]: [...values, "overflow"],
        }),
      ).toContain("128");
      expect(
        validateAgentLayerProfileInput({
          ...fields,
          [field]: ["duplicate", "duplicate"],
        }),
      ).toContain("несколько раз");
      expect(
        validateAgentLayerProfileInput({ ...fields, [field]: ["invalid key"] }),
      ).toContain("недопустимый ключ");
      expect(
        validateAgentLayerProfileInput({ ...fields, [field]: [] }),
      ).toBeUndefined();
    },
  );

  it("accepts a selected default workflow even if its target is not loaded", () => {
    expect(
      validateAgentLayerProfileInput({
        ...fields,
        workflowKeys: ["future-workflow"],
        defaultWorkflowKey: "future-workflow",
      }),
    ).toBeUndefined();
  });
});

describe("agent profile copies", () => {
  it("copies all editable values into detached arrays without writing or carrying revision", () => {
    const source = {
      ...profile,
      enabled: false,
      locale: "en-US",
      workflowKeys: ["flow"],
      defaultWorkflowKey: "flow",
    };
    const snapshot = structuredClone(source);
    const copy = createAgentLayerProfileCopy(source, agentLayerDraft.artifacts);
    expect(copy.key).toBe(`${profile.key}.copy`);
    expect(copy.title).toBe(`${profile.title} (копия)`);
    expect(copy).toMatchObject({
      enabled: false,
      locale: "en-US",
      workflowKeys: ["flow"],
      defaultWorkflowKey: "flow",
    });
    expect(copy).not.toHaveProperty("revision");
    expect(copy).not.toHaveProperty("kind");
    for (const field of referenceFields) {
      expect(copy[field]).toEqual(source[field]);
      expect(copy[field]).not.toBe(source[field]);
    }
    (copy.ruleKeys as string[]).push("copy-only");
    expect(source).toEqual(snapshot);
    const update = buildAgentLayerProfileUpdate(agentLayerDraft, copy);
    expect(update.artifacts.at(-1)).toMatchObject({
      key: copy.key,
      revision: 1,
    });
  });

  it("finds a bounded unique profile key while ignoring other kinds", () => {
    const source = { ...profile, key: "x".repeat(128), title: "Я".repeat(120) };
    const firstKey = `${source.key.slice(0, 123)}.copy`;
    const secondKey = `${source.key.slice(0, 121)}.copy-2`;
    const thirdKey = `${source.key.slice(0, 121)}.copy-3`;
    const copy = createAgentLayerProfileCopy(source, [
      source,
      { ...source, key: firstKey },
      { ...source, key: secondKey },
      { ...agentLayerRule, key: thirdKey },
    ]);
    expect(copy.key).toBe(thirdKey);
    expect(copy.key).toHaveLength(128);
    expect(copy.title).toHaveLength(120);
    expect(copy.title.endsWith(" (копия)")).toBe(true);
    expect(copy).not.toHaveProperty("defaultWorkflowKey");
    expect(validateAgentLayerProfileInput(copy)).toBeUndefined();
  });
});
