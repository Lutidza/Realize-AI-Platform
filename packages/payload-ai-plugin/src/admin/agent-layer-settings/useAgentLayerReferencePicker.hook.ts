/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerReferencePicker.hook.ts
 * @version 1.0.1
 * @date 2026-09-10
 * @description Адаптирует связи черновика к общему выбору ключей с учётом отсутствующих и выключенных записей.
 */

"use client";

import type { UseAgentLayerReferencePickerOptions } from "./AgentLayerReferencePicker.types";
import { useAgentLayerChoiceList } from "./useAgentLayerChoiceList.hook";

/** Фильтрация затрагивает только выдачу; выбранные ключи меняются явным действием. */
export const useAgentLayerReferencePicker = ({
  artifacts,
  kind,
  selectedKeys,
  sourceEnabled,
  disabled,
  onChange,
}: UseAgentLayerReferencePickerOptions) => {
  const available = artifacts.filter((artifact) => artifact.kind === kind);
  const byKey = new Map(available.map((artifact) => [artifact.key, artifact]));
  const selected = new Set(selectedKeys);
  const disabledCount = [...selected].filter(
    (key) => byKey.get(key)?.enabled === false,
  ).length;
  const picker = useAgentLayerChoiceList({
    options: available.map((artifact) => ({
      key: artifact.key,
      title: artifact.title || artifact.key,
      code: artifact.key,
      inactive: !artifact.enabled,
      inactiveIsProblem: sourceEnabled,
      canOpen: true,
    })),
    selectedKeys,
    disabled,
    onChange,
  });
  return {
    ...picker,
    problemCount: picker.missingCount + (sourceEnabled ? disabledCount : 0),
    disabledCount,
  };
};
