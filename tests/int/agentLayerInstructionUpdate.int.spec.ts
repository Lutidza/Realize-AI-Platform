/**
 * @file tests/int/agentLayerInstructionUpdate.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет поля инструкций, сохранение aggregate, ограничения списков и независимость копий.
 */

import { describe, expect, it } from "vitest";
import type {
  AILocalRoleDefinition,
  AISkillDefinition,
  AIPromptTemplateDefinition,
} from "@realize/ai-contracts";
import {
  assertAIConfigArtifactRevisions,
  validateAIConfigDraft,
} from "@realize/change-engine";
import type {
  AgentLayerInstructionArtifact,
  AgentLayerInstructionInput,
} from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerInstruction.types";
import { buildAgentLayerInstructionUpdate } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/buildAgentLayerInstructionUpdate.mapper";
import { createAgentLayerInstructionCopy } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/createAgentLayerInstructionCopy.util";
import { getAgentLayerInstructionFields } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerInstructionFields.util";
import { isAgentLayerInstructionArtifact } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/isAgentLayerInstructionArtifact.util";
import { validateAgentLayerInstructionInput } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/validateAgentLayerInstructionInput.validator";
import { agentLayerDraft } from "./fixtures/agentLayerConfiguration";

const role: AILocalRoleDefinition = {
  kind: "local_role",
  key: "instruction.same",
  title: "Роль",
  enabled: true,
  revision: 3,
  instructions: "Работай с каталогом.",
  capabilityBindingKeys: ["missing.capability"],
};
const skill: AISkillDefinition = {
  kind: "skill",
  key: "instruction.same",
  title: "Навык",
  enabled: true,
  revision: 4,
  description: "Проверка каталога",
  instructions: "Проверь выбранные товары.",
  capabilityBindingKeys: ["missing.capability"],
  triggerTerms: ["Проверить каталог"],
};
const template: AIPromptTemplateDefinition = {
  kind: "prompt_template",
  key: "instruction.same",
  title: "Шаблон",
  enabled: true,
  revision: 5,
  slot: "reviewer",
  template: "Проверь {{ topic }}.",
  variables: ["topic"],
};
const sources: readonly AgentLayerInstructionArtifact[] = [
  role,
  skill,
  template,
];
const draft = {
  ...agentLayerDraft,
  artifacts: [...agentLayerDraft.artifacts, ...sources],
};

describe("instruction aggregate updates", () => {
  it.each(sources)(
    "updates only $kind with exact CAS, lineage and monotonic revision",
    (source) => {
      const before = structuredClone(draft);
      const input = {
        ...getAgentLayerInstructionFields(source),
        title: "Новое название",
        enabled: false,
      };
      const updated = buildAgentLayerInstructionUpdate(
        draft,
        input,
        source.key,
      );
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
      ).toEqual({ ...input, revision: source.revision + 1 });
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
    "keeps no-op $kind revision and strips non-form metadata",
    (source) => {
      const sourceWithMetadata = {
        ...source,
        extraMetadata: "ignored",
      };
      const input = getAgentLayerInstructionFields(sourceWithMetadata);
      expect(input).not.toHaveProperty("revision");
      expect(input).not.toHaveProperty("extraMetadata");
      const reordered = Object.fromEntries(
        Object.entries(input).reverse(),
      ) as AgentLayerInstructionInput;
      const updated = buildAgentLayerInstructionUpdate(
        draft,
        reordered,
        source.key,
      );
      expect(updated.artifacts).toEqual(draft.artifacts);
      expect(() =>
        assertAIConfigArtifactRevisions({
          current: draft,
          artifacts: updated.artifacts,
        }),
      ).not.toThrow();
    },
  );

  it.each(sources)(
    "creates $kind at revision one and rejects duplicate or renamed identity",
    (source) => {
      const input = getAgentLayerInstructionFields(source);
      const otherKinds = {
        ...draft,
        artifacts: draft.artifacts.filter(
          (item) => item.kind !== source.kind || item.key !== source.key,
        ),
      };
      const updated = buildAgentLayerInstructionUpdate(otherKinds, input);
      expect(updated.artifacts.at(-1)).toMatchObject({
        kind: source.kind,
        key: source.key,
        revision: 1,
      });
      expect(() => buildAgentLayerInstructionUpdate(draft, input)).toThrow(
        "уже существует",
      );
      expect(() =>
        buildAgentLayerInstructionUpdate(
          draft,
          { ...input, key: "renamed" },
          source.key,
        ),
      ).toThrow("не меняется");
      expect(() =>
        buildAgentLayerInstructionUpdate(otherKinds, input, source.key),
      ).toThrow("больше не найден");
    },
  );

  it.each(sources)(
    "rejects read-only $kind changes and accepts ready drafts",
    (source) => {
      const input = {
        ...getAgentLayerInstructionFields(source),
        enabled: false,
      };
      for (const state of ["released", "validating"] as const) {
        expect(() =>
          buildAgentLayerInstructionUpdate(
            { ...draft, state },
            input,
            source.key,
          ),
        ).toThrow("только для чтения");
      }
      expect(
        buildAgentLayerInstructionUpdate(
          { ...draft, state: "ready" },
          input,
          source.key,
        ).artifacts,
      ).toHaveLength(draft.artifacts.length);
    },
  );

  it("keeps reference order and detects a reordered instruction list", () => {
    const source = { ...role, capabilityBindingKeys: ["first", "second"] };
    const current = { ...draft, artifacts: [source] };
    const updated = buildAgentLayerInstructionUpdate(
      current,
      {
        ...getAgentLayerInstructionFields(source),
        capabilityBindingKeys: ["second", "first"],
      } as AgentLayerInstructionInput,
      source.key,
    );
    expect(updated.artifacts[0]).toMatchObject({
      revision: source.revision + 1,
      capabilityBindingKeys: ["second", "first"],
    });
    expect(() =>
      assertAIConfigArtifactRevisions({
        current,
        artifacts: updated.artifacts,
      }),
    ).not.toThrow();
    expect(source.capabilityBindingKeys).toEqual(["first", "second"]);
  });

  it("saves unfinished capability links and template variable mismatches for separate validation", () => {
    const roleUpdate = buildAgentLayerInstructionUpdate(
      draft,
      { ...role, instructions: "Новая инструкция" },
      role.key,
    );
    expect(
      roleUpdate.artifacts.find(
        (item) => item.kind === role.kind && item.key === role.key,
      ),
    ).toMatchObject({ capabilityBindingKeys: ["missing.capability"] });
    const input = {
      ...getAgentLayerInstructionFields(template),
      template: "Только {{ undeclared }}.",
      variables: ["unused"],
    } as AgentLayerInstructionInput;
    expect(validateAgentLayerInstructionInput(input)).toBeUndefined();
    const updated = buildAgentLayerInstructionUpdate(
      draft,
      input,
      template.key,
    );
    const validation = validateAIConfigDraft({
      ...draft,
      artifacts: updated.artifacts,
    });
    expect(validation.valid).toBe(false);
    expect(
      validation.issues.some(
        (issue) => issue.code === "config_prompt_variables_mismatch",
      ),
    ).toBe(true);
    expect(
      validation.issues.some(
        (issue) => issue.code === "config_reference_missing",
      ),
    ).toBe(true);
  });

  it("rejects unknown fields and aggregate overflow before API submission", () => {
    const input = {
      ...getAgentLayerInstructionFields(template),
      unsupported: true,
    };
    expect(() =>
      buildAgentLayerInstructionUpdate(draft, input, template.key),
    ).toThrow("unsupported");
    const full = {
      ...draft,
      artifacts: Array.from({ length: 512 }, (_, index) => ({
        ...role,
        key: `role-${index}`,
        revision: 1,
      })),
    };
    expect(() =>
      buildAgentLayerInstructionUpdate(
        full,
        getAgentLayerInstructionFields(template),
      ),
    ).toThrow("512");
  });
});

describe("instruction fields and limits", () => {
  it.each(sources)(
    "creates a detached $kind form with stable defaults",
    (source) => {
      const blank = getAgentLayerInstructionFields(source.kind);
      expect(blank).toMatchObject({
        kind: source.kind,
        key: "",
        title: "",
        enabled: true,
      });
      if (blank.kind === "prompt_template")
        expect(blank.slot).toBe("agent_instructions");
      expect(validateAgentLayerInstructionInput(blank)).toBeTypeOf("string");
      const input = getAgentLayerInstructionFields(source);
      expect(validateAgentLayerInstructionInput(input)).toBeUndefined();
      if (input.kind === "prompt_template")
        expect(input.variables).not.toBe(template.variables);
      else
        expect(input.capabilityBindingKeys).not.toBe(
          source.kind === "prompt_template" ? [] : source.capabilityBindingKeys,
        );
      if (input.kind === "skill")
        expect(input.triggerTerms).not.toBe(skill.triggerTerms);
    },
  );

  it("classifies only the three instruction artifact kinds", () => {
    expect(sources.map(isAgentLayerInstructionArtifact)).toEqual([
      true,
      true,
      true,
    ]);
    expect(isAgentLayerInstructionArtifact(agentLayerDraft.artifacts[0])).toBe(
      false,
    );
    expect(isAgentLayerInstructionArtifact(agentLayerDraft.artifacts[2])).toBe(
      false,
    );
  });

  it.each(sources)(
    "enforces shared key and title constraints for $kind",
    (source) => {
      const input = getAgentLayerInstructionFields(source);
      expect(
        validateAgentLayerInstructionInput({
          ...input,
          key: "x".repeat(128),
          title: "x".repeat(120),
        }),
      ).toBeUndefined();
      for (const change of [
        { key: "" },
        { key: "bad key" },
        { key: "x".repeat(129) },
        { title: " " },
        { title: "x".repeat(121) },
      ]) {
        expect(
          validateAgentLayerInstructionInput({ ...input, ...change }),
        ).toBeTypeOf("string");
      }
    },
  );

  it.each([role, skill])(
    "enforces instruction length and capability key limits for $kind",
    (source) => {
      const input = getAgentLayerInstructionFields(source);
      if (input.kind === "prompt_template")
        throw new Error("Unexpected fixture kind");
      const capabilityBindingKeys = Array.from(
        { length: 128 },
        (_, index) => `capability-${index}`,
      );
      expect(
        validateAgentLayerInstructionInput({
          ...input,
          instructions: "x".repeat(16000),
          capabilityBindingKeys,
        }),
      ).toBeUndefined();
      expect(
        validateAgentLayerInstructionInput({
          ...input,
          instructions: "x".repeat(16001),
        }),
      ).toContain("16000");
      expect(
        validateAgentLayerInstructionInput({ ...input, instructions: "\n " }),
      ).toBeTypeOf("string");
      expect(
        validateAgentLayerInstructionInput({
          ...input,
          capabilityBindingKeys: [...capabilityBindingKeys, "overflow"],
        }),
      ).toContain("128");
      expect(
        validateAgentLayerInstructionInput({
          ...input,
          capabilityBindingKeys: ["duplicate", "duplicate"],
        }),
      ).toContain("повторяться");
      expect(
        validateAgentLayerInstructionInput({
          ...input,
          capabilityBindingKeys: ["invalid key"],
        }),
      ).toContain("ключом");
    },
  );

  it("checks skill description and trigger terms without normalizing typed values", () => {
    const input = getAgentLayerInstructionFields(skill);
    if (input.kind !== "skill") throw new Error("Unexpected fixture kind");
    const triggerTerms = Array.from({ length: 128 }, (_, index) =>
      `${index}`.padEnd(120, "x"),
    );
    expect(
      validateAgentLayerInstructionInput({
        ...input,
        description: "x".repeat(2000),
        triggerTerms,
      }),
    ).toBeUndefined();
    expect(
      validateAgentLayerInstructionInput({
        ...input,
        description: "x".repeat(2001),
      }),
    ).toContain("2000");
    for (const values of [
      [...triggerTerms, "overflow"],
      [""],
      ["\t"],
      ["x".repeat(121)],
      ["same", "same"],
    ]) {
      expect(
        validateAgentLayerInstructionInput({ ...input, triggerTerms: values }),
      ).toBeTypeOf("string");
    }
    const spaced = {
      ...input,
      triggerTerms: ["  Проверить каталог  ", "Другое действие"],
    };
    expect(validateAgentLayerInstructionInput(spaced)).toBeUndefined();
    expect(
      buildAgentLayerInstructionUpdate(draft, spaced, skill.key).artifacts.find(
        (item) => item.kind === "skill",
      ),
    ).toMatchObject({ triggerTerms: spaced.triggerTerms });
  });

  it("checks template length, slot and bounded stable variable keys", () => {
    const input = getAgentLayerInstructionFields(template);
    if (input.kind !== "prompt_template")
      throw new Error("Unexpected fixture kind");
    const variables = Array.from(
      { length: 128 },
      (_, index) => `variable-${index}`,
    );
    for (const slot of [
      "agent_instructions",
      "planner",
      "reviewer",
      "workflow_step",
    ] as const) {
      expect(
        validateAgentLayerInstructionInput({
          ...input,
          slot,
          template: "x".repeat(32000),
          variables,
        }),
      ).toBeUndefined();
    }
    expect(
      validateAgentLayerInstructionInput({
        ...input,
        template: "x".repeat(32001),
      }),
    ).toContain("32000");
    expect(
      validateAgentLayerInstructionInput({ ...input, template: " " }),
    ).toBeTypeOf("string");
    expect(
      validateAgentLayerInstructionInput({
        ...input,
        slot: "unsupported",
      } as unknown as AgentLayerInstructionInput),
    ).toContain("назначение");
    for (const values of [
      [...variables, "overflow"],
      ["bad name"],
      ["same", "same"],
      [""],
    ]) {
      expect(
        validateAgentLayerInstructionInput({ ...input, variables: values }),
      ).toBeTypeOf("string");
    }
  });
});

describe("instruction copies", () => {
  it.each(sources)(
    "copies $kind content and arrays without carrying revision",
    (source) => {
      const before = structuredClone(source);
      const copy = createAgentLayerInstructionCopy(source, draft.artifacts);
      expect(copy).toEqual({
        ...getAgentLayerInstructionFields(source),
        key: `${source.key}.copy`,
        title: `${source.title} (копия)`,
      });
      expect(copy).not.toHaveProperty("revision");
      if (copy.kind === "prompt_template") {
        expect(copy.variables).not.toBe(template.variables);
        (copy.variables as string[]).push("only-copy");
      } else {
        expect(copy.capabilityBindingKeys).not.toBe(
          source.kind === "prompt_template" ? [] : source.capabilityBindingKeys,
        );
        (copy.capabilityBindingKeys as string[]).push("only-copy");
      }
      if (copy.kind === "skill")
        expect(copy.triggerTerms).not.toBe(skill.triggerTerms);
      expect(source).toEqual(before);
      const updated = buildAgentLayerInstructionUpdate(draft, copy);
      expect(updated.artifacts.at(-1)).toMatchObject({
        kind: source.kind,
        key: copy.key,
        revision: 1,
      });
      expect(updated.artifacts.slice(0, -1)).toEqual(draft.artifacts);
    },
  );

  it("uses bounded same-kind identity suffixes for long source keys", () => {
    const source = { ...skill, key: "x".repeat(128), title: "Я".repeat(120) };
    const firstKey = `${source.key.slice(0, 123)}.copy`;
    const secondKey = `${source.key.slice(0, 121)}.copy-2`;
    const copy = createAgentLayerInstructionCopy(source, [
      source,
      { ...source, key: firstKey },
      { ...role, key: secondKey },
    ]);
    expect(copy.key).toBe(secondKey);
    expect(copy.key).toHaveLength(128);
    expect(copy.title).toHaveLength(120);
    expect(copy.title.endsWith(" (копия)")).toBe(true);
    expect(validateAgentLayerInstructionInput(copy)).toBeUndefined();
  });
});
