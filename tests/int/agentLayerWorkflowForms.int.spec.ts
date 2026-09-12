/**
 * @file tests/int/agentLayerWorkflowForms.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет преобразование всех шагов и значений процесса, атомарное переименование и сохранение незавершённого ввода.
 */

import { describe, expect, it } from "vitest";
import type {
  AIConfigDraftDTO,
  WorkflowDefinition,
  WorkflowStep,
} from "@realize/ai-contracts";
import {
  assertAIConfigArtifactRevisions,
  validateAIConfigDraftForSystem,
} from "@realize/change-engine";
import type {
  AgentLayerWorkflowInput,
  AgentLayerWorkflowLiteralInput,
  AgentLayerWorkflowStepInput,
} from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerWorkflow.types";
import { buildAgentLayerWorkflowUpdate } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/buildAgentLayerWorkflowUpdate.mapper";
import { getAgentLayerWorkflowFields } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerWorkflowFields.util";
import { validateAgentLayerWorkflowInput } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/validateAgentLayerWorkflowInput.validator";
import { createAgentLayerWorkflowCopy } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/createAgentLayerWorkflowCopy.util";
import { createAgentLayerWorkflowStep } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/createAgentLayerWorkflowStep.util";
import { copyAgentLayerWorkflowStep } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/copyAgentLayerWorkflowStep.util";
import { changeAgentLayerWorkflowStepType } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/changeAgentLayerWorkflowStepType.util";
import { renameAgentLayerWorkflowStep } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/renameAgentLayerWorkflowStep.util";
import { getAgentLayerWorkflowStepRemovalError } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerWorkflowStepRemovalError.util";
import { removeAgentLayerWorkflowStep } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/removeAgentLayerWorkflowStep.util";
import { toAgentLayerWorkflowArtifact } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/toAgentLayerWorkflowArtifact.mapper";
import {
  AI_CONFIG_ARTIFACTS,
  SYSTEM_AI_CONFIG_FIXTURE,
} from "./fixtures/aiConfiguration";
import { agentLayerDraft } from "./fixtures/agentLayerConfiguration";

const source: WorkflowDefinition = {
  kind: "workflow_definition",
  key: "catalog-edit",
  title: "Рабочий процесс",
  description: "Процесс с шестью типами шагов.",
  enabled: true,
  revision: 8,
  entryStepKey: "plan",
  maxSteps: 7,
  steps: [
    {
      type: "agent_turn",
      key: "plan",
      promptTemplateKey: "planner",
      nextStepKey: "ask",
    },
    {
      type: "request_input",
      key: "ask",
      promptTemplateKey: "planner",
      nextStepKey: "branch",
    },
    {
      type: "branch",
      key: "branch",
      condition: {
        operator: "equals",
        left: {
          source: "step_output",
          stepKey: "plan",
          path: "decision.allowed",
        },
        right: { source: "literal", value: true },
      },
      trueStepKey: "change",
      falseStepKey: "blocked",
    },
    {
      type: "capability",
      key: "change",
      nextStepKey: "check",
      capabilityBindingKey: "catalog-category",
      input: {
        fromInput: { source: "input", path: "request.product" },
        fromStep: {
          source: "step_output",
          stepKey: "plan",
          path: "plan.result",
        },
        text: { source: "literal", value: "  plan  " },
        number: { source: "literal", value: -1.25e3 },
        boolean: { source: "literal", value: false },
        nothing: { source: "literal", value: null },
        list: { source: "literal", value: ["plan", 2, null, { answer: true }] },
        object: {
          source: "literal",
          value: { stepKey: "plan", nested: { list: [] } },
        },
      },
    },
    {
      type: "check",
      key: "check",
      nextStepKey: "done",
      checkBindingKey: "payload-access",
    },
    { type: "finish", key: "done", outcome: "completed" },
    { type: "finish", key: "blocked", outcome: "blocked" },
  ],
};
const draft: AIConfigDraftDTO = {
  ...agentLayerDraft,
  artifacts: AI_CONFIG_ARTIFACTS.map((artifact) =>
    artifact.kind === "workflow_definition" ? source : artifact,
  ),
};
const capabilityStep = (input: AgentLayerWorkflowInput) => {
  const step = input.steps.find((item) => item.type === "capability");
  if (!step || step.type !== "capability")
    throw new Error("Fixture capability step is missing");
  return step;
};
const withLiteral = (
  literal: AgentLayerWorkflowLiteralInput,
): AgentLayerWorkflowInput => {
  const fields = getAgentLayerWorkflowFields(source);
  const step = capabilityStep(fields);
  step.input = [
    {
      id: "value-row",
      key: "value",
      value: { source: "literal", value: literal },
    },
  ];
  return fields;
};

describe("workflow aggregate mapping", () => {
  it("round trips all six step kinds, all sources and every JSON literal type without form metadata", () => {
    const fields = getAgentLayerWorkflowFields(source);
    const artifact = toAgentLayerWorkflowArtifact(fields);
    expect(artifact).toEqual({ ...source, revision: 1 });
    expect(
      artifact.steps.every(
        (step) =>
          !Object.hasOwn(step, "id") && !Object.hasOwn(step, "keyInput"),
      ),
    ).toBe(true);
    expect(new Set(fields.steps.map((step) => step.id)).size).toBe(
      source.steps.length,
    );
    expect(fields.steps.every((step) => step.keyInput === step.key)).toBe(true);
    expect(fields.maxSteps).toBe("7");
    expect(validateAgentLayerWorkflowInput(fields)).toBeUndefined();
    expect(
      validateAIConfigDraftForSystem({
        draft,
        system: SYSTEM_AI_CONFIG_FIXTURE,
      }).valid,
    ).toBe(true);
  });

  it("keeps no-op revisions, unrelated artifacts, CAS and lineage while rejecting saved key changes", () => {
    const fields = getAgentLayerWorkflowFields(source);
    const before = structuredClone(draft);
    expect(
      buildAgentLayerWorkflowUpdate(draft, fields, source.key).artifacts,
    ).toEqual(draft.artifacts);
    const changed = buildAgentLayerWorkflowUpdate(
      draft,
      { ...fields, title: "Новое название", enabled: false },
      source.key,
    );
    expect(changed.expectedRevision).toBe(draft.revision);
    expect(changed.baseRelease).toEqual(draft.baseRelease);
    expect(
      changed.artifacts.filter(
        (artifact) => artifact.kind !== "workflow_definition",
      ),
    ).toEqual(
      draft.artifacts.filter(
        (artifact) => artifact.kind !== "workflow_definition",
      ),
    );
    expect(
      changed.artifacts.find(
        (artifact) => artifact.kind === "workflow_definition",
      ),
    ).toMatchObject({ title: "Новое название", enabled: false, revision: 9 });
    expect(() =>
      assertAIConfigArtifactRevisions({
        current: draft,
        artifacts: changed.artifacts,
      }),
    ).not.toThrow();
    expect(() =>
      buildAgentLayerWorkflowUpdate(
        draft,
        { ...fields, key: "renamed" },
        source.key,
      ),
    ).toThrow("не меняется");
    expect(draft).toEqual(before);
  });

  it("rejects duplicate identities, missing saved records, read-only drafts and aggregate overflow", () => {
    const fields = getAgentLayerWorkflowFields(source);
    expect(() => buildAgentLayerWorkflowUpdate(draft, fields)).toThrow(
      "уже существует",
    );
    expect(() =>
      buildAgentLayerWorkflowUpdate(agentLayerDraft, fields, source.key),
    ).toThrow("больше не найден");
    for (const state of ["released", "validating"] as const)
      expect(() =>
        buildAgentLayerWorkflowUpdate(
          { ...draft, state },
          { ...fields, enabled: false },
          source.key,
        ),
      ).toThrow("только для чтения");
    const full = {
      ...draft,
      artifacts: Array.from({ length: 512 }, (_, index) => ({
        ...source,
        key: `workflow-${index}`,
        revision: 1,
      })),
    };
    expect(() => buildAgentLayerWorkflowUpdate(full, fields)).toThrow("512");
  });

  it("keeps missing and disabled references, unfinished comparisons and graph errors for semantic validation", () => {
    const fields = getAgentLayerWorkflowFields(source);
    const branch = fields.steps.find((step) => step.type === "branch")!;
    if (branch.type !== "branch") throw new Error("Fixture branch missing");
    branch.condition.operator = "exists";
    branch.trueStepKey = "missing.step";
    capabilityStep(fields).capabilityBindingKey = "missing.capability";
    const update = buildAgentLayerWorkflowUpdate(draft, fields, source.key);
    expect(validateAgentLayerWorkflowInput(fields)).toBeUndefined();
    const result = validateAIConfigDraftForSystem({
      draft: { ...draft, artifacts: update.artifacts },
      system: SYSTEM_AI_CONFIG_FIXTURE,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "workflow_exists_right_forbidden",
        "workflow_transition_missing",
        "config_reference_missing",
      ]),
    );
    const comparison = getAgentLayerWorkflowFields(source);
    const comparisonStep = comparison.steps.find(
      (step) => step.type === "branch",
    )!;
    if (comparisonStep.type !== "branch")
      throw new Error("Fixture branch missing");
    delete comparisonStep.condition.right;
    expect(validateAgentLayerWorkflowInput(comparison)).toBeUndefined();
    expect(
      toAgentLayerWorkflowArtifact(comparison).steps[2],
    ).not.toHaveProperty("condition.right");
    expect(
      validateAgentLayerWorkflowInput({
        ...fields,
        steps: [],
        entryStepKey: "missing",
      }),
    ).toBeUndefined();
  });

  it("rejects unknown executable fields instead of silently stripping them", () => {
    const fields = getAgentLayerWorkflowFields(source);
    expect(() =>
      toAgentLayerWorkflowArtifact({
        ...fields,
        command: "untrusted",
      } as unknown as AgentLayerWorkflowInput),
    ).toThrow("unsupported");
    const extraStep = {
      ...fields,
      steps: fields.steps.map((step, index) =>
        index === 0 ? { ...step, executor: "untrusted" } : step,
      ),
    };
    expect(() => toAgentLayerWorkflowArtifact(extraStep)).toThrow(
      "unsupported",
    );
    const step = capabilityStep(fields);
    step.input = [
      {
        ...step.input[0],
        unexpected: true,
      } as unknown as (typeof step.input)[number],
    ];
    expect(() => toAgentLayerWorkflowArtifact(fields)).toThrow(
      "неподдерживаемое",
    );
  });

  it("creates independent workflow copies with bounded identities and revision one only on save", () => {
    const original = {
      ...source,
      key: "w".repeat(128),
      title: "Я".repeat(120),
    };
    const firstKey = `${original.key.slice(0, 123)}.copy`;
    const copy = createAgentLayerWorkflowCopy(original, [
      original,
      { ...original, key: firstKey },
    ]);
    expect(copy.key).toBe(`${original.key.slice(0, 121)}.copy-2`);
    expect(copy.title).toHaveLength(120);
    const before = structuredClone(source);
    capabilityStep(copy).input = [];
    expect(source).toEqual(before);
    expect(
      buildAgentLayerWorkflowUpdate(draft, copy).artifacts.at(-1),
    ).toMatchObject({ key: copy.key, revision: 1 });
  });
});

describe("workflow structural input and literal limits", () => {
  it("names the invalid parameter independently of its sorted position and keeps a fallback for empty names", () => {
    const fields = withLiteral({ type: "object", valueText: "{" });
    const step = capabilityStep(fields);
    step.input = [
      {
        id: "first-row",
        key: "zzz",
        value: { source: "literal", value: { type: "null" } },
      },
      ...step.input,
    ];
    expect(validateAgentLayerWorkflowInput(fields)).toContain(
      "параметр «value»",
    );
    step.input = step.input.map((field, index) =>
      index === 1 ? { ...field, key: "" } : field,
    );
    expect(validateAgentLayerWorkflowInput(fields)).toContain("поле 2");
  });

  it("keeps empty new fields and rejects missing required identity, title or description", () => {
    expect(getAgentLayerWorkflowFields()).toMatchObject({
      key: "",
      title: "",
      description: "",
      maxSteps: "64",
      entryStepKey: "",
      steps: [],
    });
    const fields = getAgentLayerWorkflowFields(source);
    for (const change of [
      { key: "bad key" },
      { title: " " },
      { title: "t".repeat(121) },
      { description: " " },
      { description: "x".repeat(2001) },
      { entryStepKey: "" },
    ])
      expect(
        validateAgentLayerWorkflowInput({ ...fields, ...change }),
      ).toBeTypeOf("string");
  });

  it("preserves invalid maxSteps input and enforces the structural step and input-field caps", () => {
    const fields = getAgentLayerWorkflowFields(source);
    for (const maxSteps of [
      "",
      "0",
      "65",
      "-1",
      "1.5",
      "1e1",
      "Infinity",
      " 1",
      "9007199254740992",
    ])
      expect(
        validateAgentLayerWorkflowInput({ ...fields, maxSteps }),
      ).toContain("Лимит шагов");
    for (const maxSteps of ["1", "01", "64"])
      expect(
        validateAgentLayerWorkflowInput({ ...fields, maxSteps }),
      ).toBeUndefined();
    const steps: AgentLayerWorkflowStepInput[] = Array.from(
      { length: 64 },
      (_, index) => ({
        id: `id-${index}`,
        key: `key-${index}`,
        keyInput: `key-${index}`,
        type: "finish",
        outcome: "completed",
      }),
    );
    expect(
      validateAgentLayerWorkflowInput({ ...fields, steps }),
    ).toBeUndefined();
    expect(
      validateAgentLayerWorkflowInput({
        ...fields,
        steps: [...steps, { ...steps[0], id: "overflow" }],
      }),
    ).toContain("64");
    const step = capabilityStep(fields);
    step.input = Array.from({ length: 64 }, (_, index) => ({
      id: `id-${index}`,
      key: `key-${index}`,
      value: { source: "literal", value: { type: "null" } },
    }));
    expect(validateAgentLayerWorkflowInput(fields)).toBeUndefined();
    step.input = [
      ...step.input,
      { ...step.input[0], id: "overflow", key: "overflow" },
    ];
    expect(validateAgentLayerWorkflowInput(fields)).toContain("64");
  });

  it("does not collapse duplicate input keys or repeated local identities", () => {
    const fields = getAgentLayerWorkflowFields(source);
    const step = capabilityStep(fields);
    step.input = [
      { ...step.input[0], id: "one" },
      { ...step.input[1], id: "two", key: step.input[0].key },
    ];
    const before = structuredClone(fields);
    expect(validateAgentLayerWorkflowInput(fields)).toContain("повторяется");
    expect(fields).toEqual(before);
    step.input = [
      { ...step.input[0] },
      { ...step.input[1], key: "other", id: "one" },
    ];
    expect(validateAgentLayerWorkflowInput(fields)).toContain("идентификаторы");
    expect(
      validateAgentLayerWorkflowInput({
        ...fields,
        steps: [...fields.steps, fields.steps[0]],
      }),
    ).toContain("идентификаторы");
  });

  it.each([
    { type: "number", valueText: "" },
    { type: "number", valueText: "Infinity" },
    { type: "number", valueText: "1e400" },
    { type: "number", valueText: "true" },
    { type: "object", valueText: "{" },
    { type: "object", valueText: "[]" },
    { type: "object", valueText: "null" },
    { type: "array", valueText: "{}" },
  ] satisfies readonly AgentLayerWorkflowLiteralInput[])(
    "keeps invalid literal $type $valueText editable without writing it",
    (literal) => {
      const fields = withLiteral(literal);
      const before = structuredClone(fields);
      expect(validateAgentLayerWorkflowInput(fields)).toBeTypeOf("string");
      expect(fields).toEqual(before);
    },
  );

  it.each([
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"nested":{"x":1,"x":2}}',
    '[{"nested":1,"nested":2}]',
  ])(
    "rejects duplicate JSON keys without silently choosing the last value: %s",
    (valueText) => {
      const fields = withLiteral({
        type: valueText.startsWith("[") ? "array" : "object",
        valueText,
      });
      expect(validateAgentLayerWorkflowInput(fields)).toContain("повторяется");
    },
  );

  it("accepts escaped punctuation and repeated keys in separate objects, preserving scalar whitespace", () => {
    const literal = {
      type: "array",
      valueText: '[{"a":1,"text":"braces { } \\"quoted\\""},{"a":2}]',
    } as const;
    expect(
      validateAgentLayerWorkflowInput(withLiteral(literal)),
    ).toBeUndefined();
    const canonical = toAgentLayerWorkflowArtifact(
      withLiteral({ type: "string", value: " \n plan\t " }),
    );
    const step = canonical.steps.find((item) => item.type === "capability")!;
    if (step.type !== "capability")
      throw new Error("Fixture capability missing");
    expect(step.input.value).toEqual({
      source: "literal",
      value: " \n plan\t ",
    });
  });

  it("enforces nested JSON shape, cardinality, depth and string bounds through the canonical parser", () => {
    expect(
      validateAgentLayerWorkflowInput(
        withLiteral({ type: "string", value: "x".repeat(32000) }),
      ),
    ).toBeUndefined();
    expect(
      validateAgentLayerWorkflowInput(
        withLiteral({ type: "string", value: "x".repeat(32001) }),
      ),
    ).toBeTypeOf("string");
    expect(
      validateAgentLayerWorkflowInput(
        withLiteral({
          type: "array",
          valueText: JSON.stringify(Array(256).fill(null)),
        }),
      ),
    ).toBeUndefined();
    expect(
      validateAgentLayerWorkflowInput(
        withLiteral({
          type: "array",
          valueText: JSON.stringify(Array(257).fill(null)),
        }),
      ),
    ).toBeTypeOf("string");
    const object = Object.fromEntries(
      Array.from({ length: 128 }, (_, index) => [`key${index}`, null]),
    );
    expect(
      validateAgentLayerWorkflowInput(
        withLiteral({ type: "object", valueText: JSON.stringify(object) }),
      ),
    ).toBeUndefined();
    expect(
      validateAgentLayerWorkflowInput(
        withLiteral({
          type: "object",
          valueText: JSON.stringify({ ...object, overflow: true }),
        }),
      ),
    ).toBeTypeOf("string");
    expect(
      validateAgentLayerWorkflowInput(
        withLiteral({ type: "object", valueText: '{"bad key":1}' }),
      ),
    ).toBeTypeOf("string");
    expect(
      validateAgentLayerWorkflowInput(
        withLiteral({
          type: "array",
          valueText: `${"[".repeat(12)}null${"]".repeat(12)}`,
        }),
      ),
    ).toBeUndefined();
    expect(
      validateAgentLayerWorkflowInput(
        withLiteral({
          type: "array",
          valueText: `${"[".repeat(13)}null${"]".repeat(13)}`,
        }),
      ),
    ).toContain("глубина");
  });
});

describe("workflow step operations", () => {
  it.each([
    "agent_turn",
    "request_input",
    "capability",
    "check",
    "branch",
    "finish",
  ] as const)(
    "creates and copies independent %s steps with unique stable identities",
    (type) => {
      const first = createAgentLayerWorkflowStep(type, []);
      const second = createAgentLayerWorkflowStep(type, [first]);
      expect(second.id).not.toBe(first.id);
      expect(second.key).not.toBe(first.key);
      expect(second.keyInput).toBe(second.key);
      const copy = copyAgentLayerWorkflowStep(first, [first, second]);
      expect(copy.id).not.toBe(first.id);
      expect(copy.key).toBe(`${first.key}.copy`);
      expect(copy.keyInput).toBe(copy.key);
      expect(copyAgentLayerWorkflowStep(first, [first, copy]).key).toBe(
        `${first.key}.copy-2`,
      );
    },
  );

  it("renames entry, linear and branch transitions and both kinds of output references atomically", () => {
    const fields = getAgentLayerWorkflowFields(source);
    const plan = fields.steps[0];
    plan.keyInput = "renamed.plan";
    const branch = fields.steps.find((step) => step.type === "branch")!;
    if (branch.type !== "branch") throw new Error("Fixture branch missing");
    branch.trueStepKey = "plan";
    branch.falseStepKey = "plan";
    branch.condition.right = {
      source: "step_output",
      stepKey: "plan",
      path: "result",
    };
    const check = fields.steps.find((step) => step.type === "check")!;
    if (check.type !== "check") throw new Error("Fixture check missing");
    check.nextStepKey = "plan";
    capabilityStep(fields).input = [
      ...capabilityStep(fields).input,
      {
        id: "invalid-number",
        key: "pending",
        value: {
          source: "literal",
          value: { type: "number", valueText: "1e" },
        },
      },
    ];
    const before = structuredClone(fields);
    expect(validateAgentLayerWorkflowInput(fields)).toContain("переименование");
    const renamed = renameAgentLayerWorkflowStep(fields, plan.id);
    expect(renamed.entryStepKey).toBe("renamed.plan");
    expect(renamed.steps[0]).toMatchObject({
      id: plan.id,
      key: "renamed.plan",
      keyInput: "renamed.plan",
    });
    expect(renamed.steps.find((step) => step.type === "branch")).toMatchObject({
      trueStepKey: "renamed.plan",
      falseStepKey: "renamed.plan",
      condition: {
        left: { stepKey: "renamed.plan" },
        right: { stepKey: "renamed.plan" },
      },
    });
    expect(renamed.steps.find((step) => step.type === "check")).toMatchObject({
      nextStepKey: "renamed.plan",
    });
    const input = capabilityStep(renamed).input;
    expect(input.find((field) => field.key === "fromStep")?.value).toEqual({
      source: "step_output",
      stepKey: "renamed.plan",
      path: "plan.result",
    });
    expect(input.find((field) => field.key === "object")?.value).toEqual(
      capabilityStep(before).input.find((field) => field.key === "object")
        ?.value,
    );
    expect(input.at(-1)?.value).toEqual({
      source: "literal",
      value: { type: "number", valueText: "1e" },
    });
    expect(fields).toEqual(before);
  });

  it("rejects invalid, duplicate and ambiguous renames while retaining the pending key", () => {
    const fields = getAgentLayerWorkflowFields(source);
    for (const keyInput of ["bad key", "", "x".repeat(129), "done"]) {
      fields.steps[0].keyInput = keyInput;
      expect(() =>
        renameAgentLayerWorkflowStep(fields, fields.steps[0].id),
      ).toThrow();
      expect(fields.steps[0].key).toBe("plan");
      expect(fields.steps[0].keyInput).toBe(keyInput);
    }
    fields.steps[0].keyInput = "new.plan";
    fields.steps = [
      ...fields.steps,
      { ...fields.steps[0], id: "duplicate-row", keyInput: "plan" },
    ];
    expect(() =>
      renameAgentLayerWorkflowStep(fields, fields.steps[0].id),
    ).toThrow("несколькими");
    expect(() => renameAgentLayerWorkflowStep(fields, "missing-id")).toThrow(
      "не найден",
    );
  });

  it("blocks removal used by entry, transitions or output references and allows safe duplicate repair", () => {
    const fields = getAgentLayerWorkflowFields(source);
    expect(
      getAgentLayerWorkflowStepRemovalError(fields, fields.steps[0].id),
    ).toContain("начальный");
    const done = fields.steps.find((step) => step.key === "done")!;
    expect(getAgentLayerWorkflowStepRemovalError(fields, done.id)).toContain(
      "check",
    );
    expect(() => removeAgentLayerWorkflowStep(fields, done.id)).toThrow(
      "Сначала измените",
    );
    const duplicate = { ...done, id: "duplicate-row" };
    const withDuplicate = { ...fields, steps: [...fields.steps, duplicate] };
    expect(
      getAgentLayerWorkflowStepRemovalError(withDuplicate, duplicate.id),
    ).toBeUndefined();
    expect(removeAgentLayerWorkflowStep(withDuplicate, duplicate.id)).toEqual(
      fields,
    );
    const extra = createAgentLayerWorkflowStep("finish", fields.steps);
    const withExtra = { ...fields, steps: [...fields.steps, extra] };
    expect(removeAgentLayerWorkflowStep(withExtra, extra.id)).toEqual(fields);
    const outputOnly = {
      ...fields,
      entryStepKey: "ask",
      steps: fields.steps.filter((step) => step.type !== "branch"),
    };
    expect(
      getAgentLayerWorkflowStepRemovalError(outputOnly, fields.steps[0].id),
    ).toContain("change");
    expect(
      getAgentLayerWorkflowStepRemovalError(fields, "missing-id"),
    ).toContain("не найден");
  });

  it("changes step kinds only through defaults while preserving shared identity, prompt and next transition", () => {
    const fields = getAgentLayerWorkflowFields(source);
    const plan = fields.steps[0];
    plan.keyInput = "pending.rename";
    const changed = changeAgentLayerWorkflowStepType(plan, "request_input");
    expect(changed).toMatchObject({
      id: plan.id,
      key: "plan",
      keyInput: "pending.rename",
      nextStepKey: "ask",
      promptTemplateKey: "planner",
    });
    const finish = changeAgentLayerWorkflowStepType(
      capabilityStep(fields),
      "finish",
    );
    expect(finish).toEqual({
      id: capabilityStep(fields).id,
      key: "change",
      keyInput: "change",
      type: "finish",
      outcome: "completed",
    });
    for (const type of [
      "agent_turn",
      "request_input",
      "capability",
      "check",
      "branch",
      "finish",
    ] satisfies WorkflowStep["type"][]) {
      const next = changeAgentLayerWorkflowStepType(plan, type);
      expect(next.type).toBe(type);
      expect(next.key).toBe(plan.key);
    }
    expect(plan.type).toBe("agent_turn");
  });
});
