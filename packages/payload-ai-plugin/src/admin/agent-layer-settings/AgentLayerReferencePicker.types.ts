/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerReferencePicker.types.ts
 * @version 1.0.1
 * @date 2026-09-10
 * @description Описывает выбор связанных записей без потери отсутствующих сохранённых ключей.
 */

import type {
  AIConfigArtifact,
  AIConfigArtifactKind,
} from "@realize/ai-contracts";
import type { ReactNode } from "react";

export type AgentLayerReferencePickerProps = {
  accordionName: string;
  artifacts: readonly AIConfigArtifact[];
  kind: AIConfigArtifactKind;
  label: string;
  description: string;
  selectedKeys: readonly string[];
  sourceEnabled: boolean;
  disabled: boolean;
  navigationDisabled?: boolean;
  /** Проблемы зависимого поля, например процесса по умолчанию вне выбранного состава. */
  additionalProblemCount?: number;
  onChange: (keys: readonly string[]) => void;
  onOpen: (artifact: AIConfigArtifact) => void;
  children?: ReactNode;
};

export type UseAgentLayerReferencePickerOptions = Pick<
  AgentLayerReferencePickerProps,
  | "artifacts"
  | "kind"
  | "selectedKeys"
  | "sourceEnabled"
  | "disabled"
  | "onChange"
>;
