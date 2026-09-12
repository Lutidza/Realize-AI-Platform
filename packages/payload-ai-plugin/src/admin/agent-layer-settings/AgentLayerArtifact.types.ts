/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerArtifact.types.ts
 * @version 1.1.0
 * @date 2026-09-10
 * @description Задаёт контракты просмотра записей и связей внутри выбранного черновика.
 */

import type {
  AIConfigArtifact,
  AIConfigArtifactKind,
  AIConfigBootstrapDTO,
} from "@realize/ai-contracts";
import type { ReactNode } from "react";

/** Тип обязателен: одинаковый ключ разрешён у разных видов записей. */
export type AgentLayerArtifactReference = {
  kind: AIConfigArtifactKind;
  key: string;
};

/** Структурные связи черновика; отсутствующая цель не удаляет исходящую ссылку. */
export type AgentLayerArtifactRelations = {
  incoming: readonly AIConfigArtifact[];
  outgoing: readonly {
    reference: AgentLayerArtifactReference;
    artifact?: AIConfigArtifact;
  }[];
};

export type AgentLayerArtifactDetailsProps = {
  artifact: AIConfigArtifact;
  artifacts: readonly AIConfigArtifact[];
  system: AIConfigBootstrapDTO["system"];
  onSelect: (artifact: AIConfigArtifact) => void;
  disabled?: boolean;
  /** Редактор заменяет содержимое записи, сохраняя общую колонку связей. */
  children?: ReactNode;
};

/** Самостоятельная колонка связей использует те же защищённые переходы и системную проекцию. */
export type AgentLayerArtifactRelationsProps = Omit<
  AgentLayerArtifactDetailsProps,
  "children"
> & {
  /** В редакторе исходящие связи задаются полями; здесь остаётся только использование. */
  incomingOnly?: boolean;
};

export type UseAgentLayerArtifactRelationsOptions = Pick<
  AgentLayerArtifactRelationsProps,
  "artifact" | "artifacts" | "system" | "incomingOnly"
>;
