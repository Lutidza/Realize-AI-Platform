/**
 * @file tests/int/agentLayerWorkflowEditor.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет выбор шагов, сохранение промежуточного ввода и формы декларативных значений.
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowDefinition } from "@realize/ai-contracts";
import type {
  AgentLayerWorkflowInput,
  AgentLayerWorkflowLiteralInput,
  AgentLayerWorkflowStepInput,
} from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerWorkflow.types";
import { getAgentLayerWorkflowFields } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerWorkflowFields.util";
import { useAgentLayerWorkflowEditor } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerWorkflowEditor.hook";
import { useAgentLayerWorkflowInputs } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerWorkflowInputs.hook";
import { useAgentLayerChoiceList } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerChoiceList.hook";
import { AgentLayerWorkflowLiteralEditor } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerWorkflowLiteralEditor.component";
import { AgentLayerWorkflowValueSourceEditor } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerWorkflowValueSourceEditor.component";
import { AgentLayerWorkflowStepEditor } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerWorkflowStepEditor.component";
import type { AgentLayerWorkflowEditorState } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerWorkflowEditor.types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const definition: WorkflowDefinition = {
  kind: "workflow_definition",
  key: "workflow",
  title: "Процесс",
  description: "Проверка редактора",
  enabled: true,
  revision: 1,
  maxSteps: 64,
  entryStepKey: "start",
  steps: [
    {
      key: "start",
      type: "agent_turn",
      promptTemplateKey: "missing.prompt",
      nextStepKey: "finish",
    },
    { key: "finish", type: "finish", outcome: "completed" },
  ],
};

const renderEditorHook = (
  initial = getAgentLayerWorkflowFields(definition),
  disabled = false,
) =>
  renderHook(() => {
    const [fields, setFields] = useState(initial);
    const editor = useAgentLayerWorkflowEditor({
      fields,
      artifacts: [],
      disabled,
      onChange: setFields,
    });
    return { fields, editor };
  });

describe("workflow step workspace", () => {
  it("keeps hidden selections known when consumer filters the shared list", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useAgentLayerChoiceList({
        options: [
          { key: "a", title: "A" },
          { key: "b", title: "B" },
        ],
        selectedKeys: ["a"],
        disabled: false,
        mode: "single",
        filterOption: (option) => option.key === "b",
        onChange,
      }),
    );
    expect(result.current.rows.map((row) => row.key)).toEqual(["b"]);
    expect(result.current.missingCount).toBe(0);
    expect(result.current.selectedCount).toBe(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("preserves a pending rename across step navigation and atomically applies it", () => {
    const { result } = renderEditorHook();
    const selected = result.current.editor.selectedStep!;
    act(() =>
      result.current.editor.updateStep({
        ...selected,
        keyInput: "renamed.start",
      }),
    );
    act(() =>
      result.current.editor.openStep(result.current.fields.steps[1]!.id),
    );
    expect(result.current.fields.steps[0]?.keyInput).toBe("renamed.start");
    expect(result.current.fields.steps[0]?.key).toBe("start");
    act(() => result.current.editor.openStep(selected.id));
    act(() => result.current.editor.renameStep());
    expect(result.current.fields.entryStepKey).toBe("renamed.start");
    expect(result.current.editor.selectedStep?.id).toBe(selected.id);
    expect(result.current.editor.selectedStep?.keyInput).toBe("renamed.start");
  });

  it("keeps invalid or duplicate rename input with an explicit error", () => {
    const { result } = renderEditorHook();
    act(() =>
      result.current.editor.updateStep({
        ...result.current.editor.selectedStep!,
        keyInput: "finish",
      }),
    );
    act(() => result.current.editor.renameStep());
    expect(result.current.editor.error).toBeTruthy();
    expect(result.current.editor.selectedStep).toMatchObject({
      key: "start",
      keyInput: "finish",
    });
    expect(result.current.fields.entryStepKey).toBe("start");
  });

  it("filters many steps without losing their selected identity or contents", () => {
    const initial = getAgentLayerWorkflowFields({
      ...definition,
      steps: Array.from({ length: 35 }, (_, index) => ({
        key: `finish.${index}`,
        type: "finish",
        outcome: "completed",
      })),
      entryStepKey: "finish.0",
    });
    const { result } = renderEditorHook(initial);
    expect(result.current.editor.picker.rows).toHaveLength(25);
    act(() => result.current.editor.picker.setPage(2));
    expect(result.current.editor.picker.rows).toHaveLength(10);
    act(() => result.current.editor.setTypeFilter("branch"));
    expect(result.current.editor.picker.rows).toEqual([]);
    expect(result.current.editor.picker.missingCount).toBe(0);
    expect(result.current.fields).toEqual(initial);
  });

  it("protects referenced steps and allows the empty workflow to acquire its first entry", () => {
    const { result } = renderEditorHook();
    act(() => result.current.editor.removeStep());
    expect(result.current.editor.removalReason).toBeTruthy();
    expect(result.current.fields.steps).toHaveLength(2);
    const empty = renderEditorHook(getAgentLayerWorkflowFields());
    act(() => empty.result.current.editor.setNewType("finish"));
    act(() => empty.result.current.editor.addStep());
    expect(empty.result.current.fields.entryStepKey).toBe(
      empty.result.current.fields.steps[0]?.key,
    );
  });

  it("retains a saved dangling entry when repairing a workflow without steps", () => {
    const initial = {
      ...getAgentLayerWorkflowFields(),
      entryStepKey: "missing.start",
    };
    const { result } = renderEditorHook(initial);
    act(() => result.current.editor.setNewType("finish"));
    act(() => result.current.editor.addStep());
    expect(result.current.fields.steps).toHaveLength(1);
    expect(result.current.fields.entryStepKey).toBe("missing.start");
  });

  it("requires confirmation to replace step fields and respects readonly mode", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = renderEditorHook();
    act(() => result.current.editor.changeStepType("finish"));
    expect(confirm).toHaveBeenCalledOnce();
    expect(result.current.editor.selectedStep?.type).toBe("agent_turn");
    const locked = renderEditorHook(
      getAgentLayerWorkflowFields(definition),
      true,
    );
    act(() => locked.result.current.editor.addStep());
    expect(locked.result.current.fields.steps).toHaveLength(2);
  });
});

describe("workflow typed values", () => {
  it.each([
    {
      value: { type: "number", valueText: "2" },
      name: "Числовое значение",
      text: "2e",
    },
    {
      value: { type: "object", valueText: "{}" },
      name: "Объект значений (JSON)",
      text: '{"invalid":',
    },
    {
      value: { type: "array", valueText: "[]" },
      name: "Массив значений (JSON)",
      text: "[1,",
    },
  ] satisfies {
    value: AgentLayerWorkflowLiteralInput;
    name: string;
    text: string;
  }[])("preserves unfinished $name input", ({ value, name, text }) => {
    const onChange = vi.fn();
    render(
      createElement(AgentLayerWorkflowLiteralEditor, {
        id: "literal",
        value,
        disabled: false,
        onChange,
      }),
    );
    fireEvent.change(screen.getByRole("textbox", { name }), {
      target: { value: text },
    });
    expect(onChange).toHaveBeenCalledWith({ ...value, valueText: text });
  });

  it("renders all scalar literal controls without raw JSON workflow editing", () => {
    const onChange = vi.fn();
    const view = render(
      createElement(AgentLayerWorkflowLiteralEditor, {
        id: "literal",
        value: { type: "string", value: "text" },
        disabled: false,
        onChange,
      }),
    );
    expect(
      screen.getByRole("textbox", { name: "Текст значения" }),
    ).toBeTruthy();
    view.rerender(
      createElement(AgentLayerWorkflowLiteralEditor, {
        id: "literal",
        value: { type: "boolean", value: false },
        disabled: false,
        onChange,
      }),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Логическое значение" }),
      { target: { value: "true" } },
    );
    expect(onChange).toHaveBeenLastCalledWith({ type: "boolean", value: true });
    view.rerender(
      createElement(AgentLayerWorkflowLiteralEditor, {
        id: "literal",
        value: { type: "null" },
        disabled: false,
        onChange,
      }),
    );
    expect(screen.getByText("Передаётся пустое значение null.")).toBeTruthy();
  });

  it("preserves an orphan output reference while editing its value path", () => {
    const onChange = vi.fn();
    render(
      createElement(AgentLayerWorkflowValueSourceEditor, {
        id: "source",
        label: "Источник",
        value: { source: "step_output", stepKey: "missing", path: "old.path" },
        steps: [],
        disabled: false,
        onChange,
        onOpenStep: vi.fn(),
      }),
    );
    expect(
      screen.getByRole("button", { name: "Выбрано «missing»", hidden: true }),
    ).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Путь к значению" }), {
      target: { value: "new.path" },
    });
    expect(onChange).toHaveBeenCalledWith({
      source: "step_output",
      stepKey: "missing",
      path: "new.path",
    });
  });

  it("retains duplicate parameter names and their raw values across input selection", () => {
    const initial: Extract<
      AgentLayerWorkflowStepInput,
      { type: "capability" }
    > = {
      id: "step",
      key: "cap",
      keyInput: "cap",
      type: "capability",
      capabilityBindingKey: "cap.binding",
      nextStepKey: "finish",
      input: [
        {
          id: "first",
          key: "same",
          value: {
            source: "literal",
            value: { type: "number", valueText: "2e" },
          },
        },
        { id: "second", key: "same", value: { source: "input", path: "id" } },
      ],
    };
    const { result } = renderHook(() => {
      const [step, onChange] = useState(initial);
      return {
        step,
        input: useAgentLayerWorkflowInputs({ step, disabled: false, onChange }),
      };
    });
    act(() => result.current.input.picker.toggle("second"));
    expect(result.current.input.selected?.id).toBe("second");
    expect(result.current.step.input).toEqual(initial.input);
    act(() => result.current.input.remove());
    expect(result.current.step.input[0]?.value).toEqual(
      initial.input[0]?.value,
    );
  });

  it("shows an existing right operand with exists until explicit removal", () => {
    const step: Extract<AgentLayerWorkflowStepInput, { type: "branch" }> = {
      id: "branch",
      key: "branch",
      keyInput: "branch",
      type: "branch",
      trueStepKey: "finish",
      falseStepKey: "finish",
      condition: {
        left: { source: "input", path: "id" },
        operator: "exists",
        right: {
          source: "literal",
          value: { type: "string", value: "saved right" },
        },
      },
    };
    const updateStep = vi.fn();
    const workflow = {
      selectedStep: step,
      updateStep,
      copyStep: vi.fn(),
      changeStepType: vi.fn(),
      renameStep: vi.fn(),
      removeStep: vi.fn(),
      openStep: vi.fn(),
      problems: ["Удалите правую часть."],
      removalReason: "Начальный шаг",
    } as unknown as AgentLayerWorkflowEditorState;
    const fields: AgentLayerWorkflowInput = {
      ...getAgentLayerWorkflowFields(definition),
      steps: [step],
    };
    render(
      createElement(AgentLayerWorkflowStepEditor, {
        id: "step",
        step,
        fields,
        artifacts: [],
        workflow,
        disabled: false,
        navigationDisabled: false,
        onOpen: vi.fn(),
      }),
    );
    expect(
      screen.getByRole("textbox", { name: "Текст значения" }),
    ).toHaveProperty("value", "saved right");
    fireEvent.click(
      screen.getByRole("button", { name: "Удалить правую часть" }),
    );
    expect(updateStep.mock.calls[0]?.[0].condition).toEqual({
      left: step.condition.left,
      operator: "exists",
    });
  });
});
