/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerWorkflowInputs.hook.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Управляет выбором и явными изменениями строк входных параметров выбранного шага.
 */

"use client";

import { useState } from "react";
import type { AgentLayerWorkflowInputFieldsProps } from "./AgentLayerWorkflowEditor.types";
import { AGENT_LAYER_WORKFLOW_SOURCE_LABELS } from "./agentLayerWorkflowPresentation.config";
import { useAgentLayerChoiceList } from "./useAgentLayerChoiceList.hook";
import { createAgentLayerWorkflowValueSourceInput } from "./createAgentLayerWorkflowValueSourceInput.util";

export const useAgentLayerWorkflowInputs = ({
  step,
  disabled,
  onChange,
}: Pick<
  AgentLayerWorkflowInputFieldsProps,
  "step" | "disabled" | "onChange"
>) => {
  const [selectedID, setSelectedID] = useState<string>();
  const selected =
    step.input.find((row) => row.id === selectedID) ?? step.input[0];
  const picker = useAgentLayerChoiceList({
    options: step.input.map((row) => ({
      key: row.id,
      title: row.key || "Параметр без имени",
      description: AGENT_LAYER_WORKFLOW_SOURCE_LABELS[row.value.source],
    })),
    selectedKeys: selected ? [selected.id] : [],
    mode: "single",
    disabled: false,
    onChange: (keys) => {
      if (keys[0]) setSelectedID(keys[0]);
    },
  });
  return {
    selected,
    picker,
    add: () => {
      if (disabled || step.input.length >= 64) return;
      let suffix = 1;
      while (step.input.some((row) => row.id === `input-row-${suffix}`))
        suffix++;
      const row = {
        id: `input-row-${suffix}`,
        key: "",
        value: createAgentLayerWorkflowValueSourceInput("literal"),
      };
      onChange({ ...step, input: [...step.input, row] });
      setSelectedID(row.id);
    },
    remove: () => {
      if (!disabled && selected) {
        onChange({
          ...step,
          input: step.input.filter((row) => row.id !== selected.id),
        });
        setSelectedID(undefined);
      }
    },
    update: (row: (typeof step.input)[number]) => {
      if (!disabled)
        onChange({
          ...step,
          input: step.input.map((item) => (item.id === row.id ? row : item)),
        });
    },
  };
};
