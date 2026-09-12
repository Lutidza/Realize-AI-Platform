/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerCatalog.types.ts
 * @version 1.4.0
 * @date 2026-09-10
 * @description Задаёт управляемое состояние и результат выборки каталога агентского слоя.
 */

import type {
  AIConfigArtifact,
  AIConfigArtifactKind,
} from "@realize/ai-contracts";

/** Виды, для которых рабочая область предоставляет создание и редактирование. */
export type AgentLayerEditableKind = Extract<
  AIConfigArtifactKind,
  | "agent_profile"
  | "local_role"
  | "skill"
  | "local_rule"
  | "prompt_template"
  | "capability_binding"
  | "check_binding"
  | "workflow_definition"
>;

/** Оболочка хранит состояние каждого раздела при переходах в запись и обратно. */
export type AgentLayerCatalogState = {
  search: string;
  status: "all" | "enabled" | "disabled";
  usage: "all" | "used" | "unused";
  sort: "title" | "revision" | "usage";
  page: number;
};

export type AgentLayerCatalogProps = {
  /** Полный состав версии нужен для обратных ссылок за пределами выбранного вида. */
  artifacts: readonly AIConfigArtifact[];
  kind?: AIConfigArtifactKind;
  state: AgentLayerCatalogState;
  onStateChange: (state: AgentLayerCatalogState) => void;
  onOpen: (artifact: AIConfigArtifact) => void;
  /** Отсутствует для черновика, доступного только для чтения. */
  onCreate?: (kind: AgentLayerEditableKind) => void;
  disabled: boolean;
  title: string;
  description: string;
};

export type AgentLayerCatalogCreationProps = {
  kind?: AIConfigArtifactKind;
  onCreate: (kind: AgentLayerEditableKind) => void;
  disabled: boolean;
  isAtLimit: boolean;
};

export type AgentLayerCatalogRow = {
  artifact: AIConfigArtifact;
  summary: string;
  /** Число уникальных записей, ссылающихся на этот kind + key. */
  usageCount: number;
};

export type AgentLayerCatalogSelection = {
  rows: readonly AgentLayerCatalogRow[];
  totalCount: number;
  filteredCount: number;
  page: number;
  pageCount: number;
  rangeStart: number;
  rangeEnd: number;
  hasFilters: boolean;
};
