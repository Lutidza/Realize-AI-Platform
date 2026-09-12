/**
 * @file tests/int/workflowExecution.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет strict DTO, значения, immutable переходы и границы workflow instructions.
 */

import { describe, expect, it } from "vitest";
import {
  parseContinueWorkflowInput,
  parseCreateMessageInput,
  parseWorkflowCheckpointShape,
  parseWorkflowJSONValue,
  parseWorkflowStartInput,
  type AIChatConfigurationSnapshot,
  type AIConfigArtifact,
  type WorkflowCheckpoint,
  type WorkflowDefinition,
} from "@realize/ai-contracts";
import {
  advanceWorkflowBranch,
  awaitWorkflowInput,
  blockWorkflow,
  buildWorkflowStepInstructions,
  compileAgentConfiguration,
  completeWorkflowStep,
  evaluateWorkflowCondition,
  finishWorkflow,
  getWorkflowDefinition,
  initializeWorkflow,
  parseWorkflowCheckpoint,
  renderWorkflowInputPrompt,
  resolveWorkflowCapabilityInput,
  resolveWorkflowValue,
  resumeWorkflowInput,
  startWorkflowAgentTurn,
  toWorkflowRunSummary,
} from "@realize/change-engine";
import {
  AI_CONFIG_ARTIFACTS,
  SYSTEM_AI_CONFIG_FIXTURE,
  createAIConfigDraftFixture,
  createAIConfigReleaseFixture,
} from "./fixtures/aiConfiguration";

const workflow: WorkflowDefinition = {
  key: "catalog-edit",
  title: "Процесс",
  description: "Все шесть типов шагов.",
  kind: "workflow_definition",
  enabled: true,
  revision: 1,
  maxSteps: 7,
  entryStepKey: "ask",
  steps: [
    {
      key: "ask",
      type: "request_input",
      promptTemplateKey: "planner",
      nextStepKey: "think",
    },
    {
      key: "think",
      type: "agent_turn",
      promptTemplateKey: "planner",
      nextStepKey: "create",
    },
    {
      key: "create",
      type: "capability",
      capabilityBindingKey: "catalog-category",
      input: {
        product: { source: "input", path: "product" },
        category: { source: "step_output", stepKey: "ask", path: "text" },
      },
      nextStepKey: "check",
    },
    {
      key: "check",
      type: "check",
      checkBindingKey: "payload-access",
      nextStepKey: "choose",
    },
    {
      key: "choose",
      type: "branch",
      condition: {
        left: { source: "step_output", stepKey: "check", path: "passed" },
        operator: "equals",
        right: { source: "literal", value: true },
      },
      trueStepKey: "done",
      falseStepKey: "stop",
    },
    { key: "done", type: "finish", outcome: "completed" },
    { key: "stop", type: "finish", outcome: "blocked" },
  ],
};

const snapshotFor = (
  definition = workflow,
  template = "Запрос {{request}}, контекст {{context}}",
  variables = ["request", "context"],
): AIChatConfigurationSnapshot => {
  const artifacts: AIConfigArtifact[] = AI_CONFIG_ARTIFACTS.map((artifact) =>
    artifact.kind === "workflow_definition"
      ? definition
      : artifact.kind === "prompt_template"
        ? { ...artifact, template, variables }
        : artifact,
  );
  return {
    schemaVersion: "1.0",
    pointerVersion: 3,
    releaseVersion: 1,
    compiled: compileAgentConfiguration({
      profileKey: "admin",
      release: createAIConfigReleaseFixture(
        createAIConfigDraftFixture(artifacts),
      ),
      system: SYSTEM_AI_CONFIG_FIXTURE,
    }),
  };
};
const snapshot = snapshotFor();
const initial = () =>
  initializeWorkflow(snapshot, "catalog-edit", "Исходный запрос", {
    product: "product-one",
  });
const afterAgent = (): WorkflowCheckpoint => {
  let checkpoint = resumeWorkflowInput(
    snapshot,
    awaitWorkflowInput(snapshot, initial()),
    "category-one",
  );
  checkpoint = startWorkflowAgentTurn(snapshot, checkpoint);
  return completeWorkflowStep(snapshot, checkpoint, { text: "Найден товар" });
};
const afterCapability = (): WorkflowCheckpoint =>
  completeWorkflowStep(
    snapshot,
    afterAgent(),
    {
      dataOperationID: "42",
      operationHash: "a".repeat(64),
      state: "awaiting_approval",
    },
    { stepKey: "create", dataOperationID: "42", operationHash: "a".repeat(64) },
  );

describe("workflow public contracts", () => {
  it("accepts explicit workflow and keeps ordinary messages unchanged", () => {
    expect(parseCreateMessageInput({ content: "hello" })).toEqual({
      content: "hello",
    });
    expect(
      parseCreateMessageInput({
        content: "hello",
        workflow: {
          key: "catalog-edit",
          input: { number: 0, nested: { values: [false, null] } },
        },
      }).workflow,
    ).toEqual({
      key: "catalog-edit",
      input: { number: 0, nested: { values: [false, null] } },
    });
  });
  it.each([
    { key: "catalog-edit", snapshot: {} },
    { key: "catalog-edit", input: { request: "override" } },
    { key: "bad key" },
    { key: "catalog-edit", input: [] },
    { key: "catalog-edit", input: { number: Infinity } },
  ])("rejects unsupported start shape %j", (value) =>
    expect(() => parseWorkflowStartInput(value)).toThrow(),
  );
  it.each([
    { expectedVersion: 0, expectedStepKey: "ask" },
    { expectedVersion: 1, expectedStepKey: "ask", content: "   " },
    { expectedVersion: 1, expectedStepKey: "ask", content: "a".repeat(8_001) },
    { expectedVersion: 1, expectedStepKey: "ask", outputs: {} },
  ])("rejects unsupported continuation %j", (value) =>
    expect(() => parseContinueWorkflowInput(value)).toThrow(),
  );
  it("allows ready continuation without content and preserves explicit user text", () => {
    expect(
      parseContinueWorkflowInput({
        expectedVersion: 2,
        expectedStepKey: "ask",
      }),
    ).toEqual({ expectedVersion: 2, expectedStepKey: "ask" });
    expect(
      parseContinueWorkflowInput({
        expectedVersion: 2,
        expectedStepKey: "ask",
        content: " answer ",
      }).content,
    ).toBe(" answer ");
  });
  it("rejects getters without evaluating them and refuses hidden/non-JSON values", () => {
    let touched = false;
    const getter = Object.defineProperty({}, "secret", {
      enumerable: true,
      get: () => {
        touched = true;
        return "secret";
      },
    });
    for (const value of [
      getter,
      new Date(),
      { nested: undefined },
      new Array(2),
      Object.defineProperty({}, "hidden", { value: 1 }),
    ])
      expect(() => parseWorkflowJSONValue(value)).toThrow();
    expect(touched).toBe(false);
  });
  it("bounds aggregate UTF-8 bytes and detached JSON depth, arrays and objects", () => {
    expect(() =>
      parseWorkflowStartInput({
        key: "flow",
        input: Object.fromEntries(
          Array.from({ length: 5 }, (_, i) => [
            `field${i}`,
            "я".repeat(20_000),
          ]),
        ),
      }),
    ).toThrow("128 КиБ");
    let nested: unknown = null;
    for (let i = 0; i < 14; i++) nested = { nested };
    for (const value of [
      nested,
      Array.from({ length: 257 }, () => 1),
      Object.fromEntries(Array.from({ length: 129 }, (_, i) => [String(i), 0])),
    ])
      expect(() => parseWorkflowJSONValue(value)).toThrow();
    const original = { object: { value: 1 } };
    const parsed = parseWorkflowJSONValue(original);
    original.object.value = 2;
    expect(parsed).toEqual({ object: { value: 1 } });
  });
});

describe("workflow values", () => {
  const checkpoint: WorkflowCheckpoint = {
    ...initial(),
    input: {
      request: "hello",
      "a.b": "literal-dot",
      "/a": "literal-slash",
      a: { b: 1, "a/b": { "~key": [null, false, 0, ""] } },
      "": "empty",
    },
  };
  it.each([
    ["a.b", "literal-dot"],
    ["/a", "literal-slash"],
    ["/a/b", 1],
    ["/a/a~1b/~0key/0", null],
    ["/a/a~1b/~0key/1", false],
    ["/a/a~1b/~0key/2", 0],
    ["/a/a~1b/~0key/3", ""],
    ["/", "empty"],
  ])("resolves own/JSON Pointer %s", (path, value) =>
    expect(
      resolveWorkflowValue({ source: "input", path: String(path) }, checkpoint),
    ).toEqual({ found: true, value }),
  );
  it.each([
    "missing",
    "a.b.c",
    "/a/a~1b/~0key/01",
    "/a/a~1b/~0key/-",
    "/a/a~2b",
    "constructor",
    "__proto__",
    "toString",
  ])("keeps missing/prototype path absent %s", (path) =>
    expect(resolveWorkflowValue({ source: "input", path }, checkpoint)).toEqual(
      { found: false },
    ),
  );
  it("distinguishes missing from null and compares JSON object keys canonically", () => {
    expect(
      evaluateWorkflowCondition(
        { operator: "exists", left: { source: "literal", value: null } },
        checkpoint,
      ),
    ).toBe(true);
    expect(
      evaluateWorkflowCondition(
        {
          operator: "exists",
          left: { source: "step_output", stepKey: "future", path: "text" },
        },
        checkpoint,
      ),
    ).toBe(false);
    expect(
      evaluateWorkflowCondition(
        {
          operator: "equals",
          left: { source: "literal", value: { a: 1, b: 2 } },
          right: { source: "literal", value: { b: 2, a: 1 } },
        },
        checkpoint,
      ),
    ).toBe(true);
    expect(
      evaluateWorkflowCondition(
        {
          operator: "not_equals",
          left: { source: "literal", value: 1 },
          right: { source: "literal", value: "1" },
        },
        checkpoint,
      ),
    ).toBe(true);
    expect(() =>
      evaluateWorkflowCondition(
        {
          operator: "equals",
          left: { source: "input", path: "missing" },
          right: { source: "literal", value: null },
        },
        checkpoint,
      ),
    ).toThrow("отсутствует");
  });
  it("resolves typed capability inputs only after their source steps complete", () => {
    const step = workflow.steps[2];
    if (step.type !== "capability") throw new Error("fixture");
    expect(() => resolveWorkflowCapabilityInput(step, initial())).toThrow(
      "category",
    );
    expect(resolveWorkflowCapabilityInput(step, afterAgent())).toEqual({
      product: "product-one",
      category: "category-one",
    });
  });
});

describe("workflow immutable execution", () => {
  it("executes all six step kinds and preserves initial request and every previous snapshot", () => {
    const first = initial();
    const before = structuredClone(first);
    const waiting = awaitWorkflowInput(snapshot, first);
    expect(waiting.phase).toBe("awaiting_input");
    expect(waiting.completedSteps).toBe(0);
    expect(first).toEqual(before);
    let checkpoint = afterCapability();
    expect(checkpoint.completedSteps).toBe(3);
    checkpoint = completeWorkflowStep(snapshot, checkpoint, {
      passed: true,
      checkID: "payload.access",
    });
    checkpoint = advanceWorkflowBranch(snapshot, checkpoint);
    expect(checkpoint.stepKey).toBe("done");
    checkpoint = finishWorkflow(snapshot, checkpoint);
    expect(checkpoint.phase).toBe("completed");
    expect(checkpoint.completedSteps).toBe(6);
    expect(checkpoint.input.request).toBe("Исходный запрос");
    expect(checkpoint.outputs.ask).toEqual({ text: "category-one" });
    expect(checkpoint.lastCapability?.dataOperationID).toBe("42");
    expect(() => startWorkflowAgentTurn(snapshot, checkpoint)).toThrow();
  });
  it("takes false branch to an explicit blocked finish", () => {
    const checked = completeWorkflowStep(snapshot, afterCapability(), {
      passed: false,
    });
    const checkpoint = finishWorkflow(
      snapshot,
      advanceWorkflowBranch(snapshot, checked),
    );
    expect(checkpoint.phase).toBe("blocked");
    expect(checkpoint.stepKey).toBe("stop");
    expect(checkpoint.reason).toBeTruthy();
  });
  it("records failure without inventing a completed check or result", () => {
    const current = afterCapability();
    const blocked = blockWorkflow(snapshot, current, "Проверка недоступна.");
    expect(blocked.phase).toBe("blocked");
    expect(blocked.outputs).toEqual(current.outputs);
    expect(blocked.completedSteps).toBe(current.completedSteps);
  });
  it("requires explicit request-input and running agent phases", () => {
    expect(() => resumeWorkflowInput(snapshot, initial(), "answer")).toThrow();
    const ready = resumeWorkflowInput(
      snapshot,
      awaitWorkflowInput(snapshot, initial()),
      "answer",
    );
    expect(() =>
      completeWorkflowStep(snapshot, ready, { text: "not run" }),
    ).toThrow();
    expect(() => awaitWorkflowInput(snapshot, ready)).toThrow();
    expect(() => finishWorkflow(snapshot, ready)).toThrow();
  });
  it("requires a matching capability receipt and validates persisted evidence identity", () => {
    expect(() =>
      completeWorkflowStep(snapshot, afterAgent(), {
        dataOperationID: "42",
        operationHash: "a".repeat(64),
      }),
    ).toThrow();
    const good = afterCapability();
    expect(() =>
      parseWorkflowCheckpoint(snapshot, {
        ...good,
        lastCapability: { ...good.lastCapability, dataOperationID: "43" },
      }),
    ).toThrow("receipt");
    expect(() =>
      parseWorkflowCheckpoint(snapshot, {
        ...good,
        outputs: {
          ...good.outputs,
          create: { dataOperationID: "43", operationHash: "a".repeat(64) },
        },
      }),
    ).toThrow("receipt");
  });
  it.each([
    (state: WorkflowCheckpoint) => ({
      ...state,
      outputs: { unknown: { text: "injected" } },
    }),
    (state: WorkflowCheckpoint) => ({ ...state, stepKey: "done" }),
    (state: WorkflowCheckpoint) => ({ ...state, completedSteps: 1 }),
    (state: WorkflowCheckpoint) => ({ ...state, phase: "running" }),
    (state: WorkflowCheckpoint) => ({ ...state, phase: "completed" }),
    (state: WorkflowCheckpoint) => ({ ...state, trusted: true }),
    (state: WorkflowCheckpoint) => ({ ...state, workflowKey: "not-selected" }),
  ])("rejects forged checkpoint shape or graph path", (change) =>
    expect(() =>
      parseWorkflowCheckpoint(snapshot, change(initial())),
    ).toThrow(),
  );
  it("refuses output from a skipped branch and replayed branches with forged outcomes", () => {
    const branch = advanceWorkflowBranch(
      snapshot,
      completeWorkflowStep(snapshot, afterCapability(), { passed: true }),
    );
    expect(() =>
      parseWorkflowCheckpoint(snapshot, {
        ...branch,
        outputs: { ...branch.outputs, choose: { matched: false } },
      }),
    ).toThrow();
    expect(() =>
      parseWorkflowCheckpoint(snapshot, {
        ...branch,
        outputs: { ...branch.outputs, stop: { outcome: "blocked" } },
        completedSteps: branch.completedSteps + 1,
      }),
    ).toThrow();
  });
  it("enforces the cumulative step limit and allows a 64-step terminal path", () => {
    const definition: WorkflowDefinition = {
      ...workflow,
      maxSteps: 64,
      entryStepKey: "s0",
      steps: [
        ...Array.from({ length: 63 }, (_, i) => ({
          key: `s${i}`,
          type: "check" as const,
          checkBindingKey: "payload-access",
          nextStepKey: i === 62 ? "done" : `s${i + 1}`,
        })),
        { key: "done", type: "finish", outcome: "completed" },
      ],
    };
    const exact = snapshotFor(definition);
    let state = initializeWorkflow(exact, definition.key, "request");
    for (let i = 0; i < 63; i++)
      state = completeWorkflowStep(exact, state, {
        checkID: "payload.access",
        passed: true,
      });
    state = finishWorkflow(exact, state);
    expect(state.completedSteps).toBe(64);
    expect(() =>
      parseWorkflowCheckpointShape({ ...state, completedSteps: 65 }),
    ).toThrow();
    expect(() =>
      parseWorkflowCheckpoint(snapshot, { ...initial(), completedSteps: 8 }),
    ).toThrow("лимит");
  });
  it("reads historic snapshot directly and excludes all private values from public summary", () => {
    const checkpoint = {
      ...afterCapability(),
      parentRunID: "10",
      rootRunID: "1",
    };
    const summary = toWorkflowRunSummary(snapshot, checkpoint);
    expect(Object.keys(summary).sort()).toEqual(
      [
        "completedSteps",
        "key",
        "parentRunID",
        "phase",
        "revision",
        "rootRunID",
        "stepKey",
        "stepType",
        "title",
        "version",
      ].sort(),
    );
    expect(JSON.stringify(summary)).not.toContain("product-one");
    expect(summary.stepType).toBe("check");
    expect(getWorkflowDefinition(snapshot, workflow.key).revision).toBe(1);
  });
});

describe("workflow templates", () => {
  it("renders public input question without private instructions or output values", () => {
    const question = renderWorkflowInputPrompt(
      snapshot,
      awaitWorkflowInput(snapshot, initial()),
    );
    expect(question).toContain("Исходный запрос");
    expect(question).not.toContain("product-one");
    expect(question).not.toContain("Готовь минимальные");
    expect(question).not.toContain("capabilityBindingKeys");
  });
  it("combines exact step template with profile instructions and one-time JSON data substitution", () => {
    const request = '{{context}} " injected';
    const started = initializeWorkflow(snapshot, workflow.key, request, {
      product: "secret-input",
    });
    const ready = resumeWorkflowInput(
      snapshot,
      awaitWorkflowInput(snapshot, started),
      "answer",
    );
    const text = buildWorkflowStepInstructions(
      snapshot,
      startWorkflowAgentTurn(snapshot, ready),
    );
    expect(text).toContain(JSON.stringify(request));
    expect(text).toContain("secret-input");
    expect(text).toContain("Готовь минимальные изменения");
    expect(text).toContain("one bounded read-only agent turn");
    expect(() => renderWorkflowInputPrompt(snapshot, ready)).toThrow();
    expect(() => buildWorkflowStepInstructions(snapshot, initial())).toThrow();
  });
  it("rejects unknown template variables instead of silently replacing them", () => {
    const incompatible = snapshotFor(workflow, "Неизвестная {{unknown}}", [
      "unknown",
    ]);
    const state = initializeWorkflow(incompatible, workflow.key, "request");
    expect(() => renderWorkflowInputPrompt(incompatible, state)).toThrow(
      "Unsupported",
    );
  });
  it("always supplies previous step values even when the template only references request", () => {
    const exact = snapshotFor(workflow, "Только {{request}}", ["request"]);
    const state = initializeWorkflow(exact, workflow.key, "request", {
      product: "explicit-product",
    });
    const ready = resumeWorkflowInput(
      exact,
      awaitWorkflowInput(exact, state),
      "previous-answer",
    );
    const instructions = buildWorkflowStepInstructions(exact, ready);
    expect(instructions).toContain("explicit-product");
    expect(instructions).toContain("previous-answer");
  });
  it("rejects rendered instruction overflow without truncating profile rules", () => {
    const large = snapshotFor(workflow, "{{context}} ".repeat(15), ["context"]);
    const state = initializeWorkflow(large, workflow.key, "request", {
      large: "x".repeat(12_000),
    });
    const ready = resumeWorkflowInput(
      large,
      awaitWorkflowInput(large, state),
      "answer",
    );
    expect(() => buildWorkflowStepInstructions(large, ready)).toThrow(
      "128 KiB",
    );
  });
});
