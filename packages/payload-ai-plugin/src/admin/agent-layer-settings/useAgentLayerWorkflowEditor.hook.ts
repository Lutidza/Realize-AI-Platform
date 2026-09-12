/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerWorkflowEditor.hook.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Управляет выбором и явными операциями шагов внутри общей несохранённой формы процесса.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import type {
  UseAgentLayerWorkflowEditorResult,
  UseAgentLayerWorkflowEditorOptions,
} from "./AgentLayerWorkflowEditor.types";
import type { AgentLayerWorkflowStepInput } from "./AgentLayerWorkflow.types";
import { createAgentLayerWorkflowStep } from "./createAgentLayerWorkflowStep.util";
import { copyAgentLayerWorkflowStep } from "./copyAgentLayerWorkflowStep.util";
import { renameAgentLayerWorkflowStep } from "./renameAgentLayerWorkflowStep.util";
import { removeAgentLayerWorkflowStep } from "./removeAgentLayerWorkflowStep.util";
import { getAgentLayerWorkflowStepRemovalError } from "./getAgentLayerWorkflowStepRemovalError.util";
import { changeAgentLayerWorkflowStepType } from "./changeAgentLayerWorkflowStepType.util";
import { getAgentLayerWorkflowStepProblems } from "./getAgentLayerWorkflowStepProblems.util";
import { AGENT_LAYER_WORKFLOW_STEP_LABELS } from "./agentLayerWorkflowPresentation.config";
import { useAgentLayerChoiceList } from "./useAgentLayerChoiceList.hook";

/** Любая правка значений возвращается в parent form; локально хранятся только выбор и фильтры. */
export const useAgentLayerWorkflowEditor = ({
  fields,
  artifacts,
  disabled,
  onChange,
}: UseAgentLayerWorkflowEditorOptions): UseAgentLayerWorkflowEditorResult => {
  const [selectedID, setSelectedID] = useState<string>();
  const [newType, setNewType] =
    useState<AgentLayerWorkflowStepInput["type"]>("agent_turn");
  const [typeFilter, setTypeFilter] = useState<
    AgentLayerWorkflowStepInput["type"] | "all"
  >("all");
  const [problemOnly, setProblemOnly] = useState(false);
  const [error, setError] = useState<string>();
  const selectedStepRef = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(false);
  const selectedStep =
    fields.steps.find((step) => step.id === selectedID) ??
    fields.steps.find((step) => step.key === fields.entryStepKey) ??
    fields.steps[0];
  const problemsByID = new Map(
    fields.steps.map((step) => [
      step.id,
      getAgentLayerWorkflowStepProblems(step, fields, artifacts),
    ]),
  );
  const problemStepCount = [...problemsByID.values()].filter(
    (problems) => problems.length > 0,
  ).length;
  const openStep = (id: string) => {
    shouldFocus.current = true;
    setSelectedID(id);
    setError(undefined);
  };
  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    selectedStepRef.current?.focus({ preventScroll: true });
    selectedStepRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [selectedStep?.id]);
  const picker = useAgentLayerChoiceList({
    options: fields.steps.map((step) => ({
      key: step.id,
      title: step.key,
      code: AGENT_LAYER_WORKFLOW_STEP_LABELS[step.type],
      description: [
        fields.entryStepKey === step.key ? "Начальный шаг" : "",
        step.type === "finish"
          ? "Завершение процесса"
          : step.type === "branch"
            ? `Да: ${step.trueStepKey || "не выбрано"} · Нет: ${step.falseStepKey || "не выбрано"}`
            : `Далее: ${step.nextStepKey || "не выбрано"}`,
        problemsByID.get(step.id)?.length
          ? `Требует внимания: ${problemsByID.get(step.id)!.length}`
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    selectedKeys: selectedStep ? [selectedStep.id] : [],
    disabled: false,
    mode: "single",
    onChange: (keys) => {
      if (keys[0]) openStep(keys[0]);
    },
    filterOption: (option) =>
      (typeFilter === "all" ||
        fields.steps.find((step) => step.id === option.key)?.type ===
          typeFilter) &&
      (!problemOnly || Boolean(problemsByID.get(option.key)?.length)),
  });
  const attempt = (operation: () => void) => {
    if (disabled) return;
    try {
      operation();
      setError(undefined);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Не удалось изменить шаг.",
      );
    }
  };
  const updateStep = (step: AgentLayerWorkflowStepInput) => {
    if (!disabled)
      onChange({
        ...fields,
        steps: fields.steps.map((item) => (item.id === step.id ? step : item)),
      });
  };
  return {
    selectedStep,
    selectedStepRef,
    picker,
    newType,
    typeFilter,
    problemOnly,
    problemStepCount,
    problems: selectedStep ? (problemsByID.get(selectedStep.id) ?? []) : [],
    removalReason: selectedStep
      ? getAgentLayerWorkflowStepRemovalError(fields, selectedStep.id)
      : undefined,
    error,
    setNewType,
    setTypeFilter: (type) => {
      setTypeFilter(type);
      picker.setPage(1);
    },
    setProblemOnly: (value) => {
      setProblemOnly(value);
      picker.setPage(1);
    },
    openStep,
    updateStep,
    addStep: () =>
      attempt(() => {
        if (fields.steps.length >= 64)
          throw new Error("Достигнут лимит 64 шагов в процессе.");
        const step = createAgentLayerWorkflowStep(newType, fields.steps);
        onChange({
          ...fields,
          entryStepKey: fields.entryStepKey || step.key,
          steps: [...fields.steps, step],
        });
        openStep(step.id);
      }),
    copyStep: () =>
      attempt(() => {
        if (!selectedStep) return;
        if (fields.steps.length >= 64)
          throw new Error("Достигнут лимит 64 шагов в процессе.");
        const step = copyAgentLayerWorkflowStep(selectedStep, fields.steps);
        onChange({ ...fields, steps: [...fields.steps, step] });
        openStep(step.id);
      }),
    removeStep: () =>
      attempt(() => {
        if (!selectedStep) return;
        const updated = removeAgentLayerWorkflowStep(fields, selectedStep.id);
        shouldFocus.current = true;
        onChange(updated);
        setSelectedID(undefined);
      }),
    renameStep: () =>
      attempt(() => {
        if (!selectedStep) return;
        onChange(renameAgentLayerWorkflowStep(fields, selectedStep.id));
        selectedStepRef.current?.focus({ preventScroll: true });
      }),
    changeStepType: (type) =>
      attempt(() => {
        if (!selectedStep || selectedStep.type === type) return;
        if (
          !window.confirm(
            "Сменить тип шага? Поля текущего типа будут заменены. Ключ и ссылки на этот шаг сохранятся.",
          )
        )
          return;
        updateStep(changeAgentLayerWorkflowStepType(selectedStep, type));
      }),
  };
};
