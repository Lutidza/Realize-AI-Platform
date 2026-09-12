/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerArtifactRelations.hook.ts
 * @version 1.1.0
 * @date 2026-09-10
 * @description Фильтрует прямые и обратные связи записи, сохраняя отсутствующие цели и точные типы.
 */

import { useState } from "react";
import type {
  AgentLayerArtifactReference,
  UseAgentLayerArtifactRelationsOptions,
} from "./AgentLayerArtifact.types";
import { AGENT_LAYER_KIND_LABELS } from "./agentLayerPresentation.util";
import { getAgentLayerArtifactRelations } from "./getAgentLayerArtifactRelations.util";

/** Родитель задаёт key kind:key, поэтому новый объект открывается с пустым поиском. */
export const useAgentLayerArtifactRelations = ({
  artifact,
  artifacts,
  system,
  incomingOnly = false,
}: UseAgentLayerArtifactRelationsOptions) => {
  const [query, setQuery] = useState("");
  const all = getAgentLayerArtifactRelations(artifacts, artifact);
  const outgoing = incomingOnly ? [] : all.outgoing;
  const totalCount = all.incoming.length + outgoing.length;
  const showSearch = totalCount > 8;
  // После уменьшения числа связей скрытый поиск не ограничивает видимые записи.
  const needle = showSearch ? query.trim().toLocaleLowerCase("ru-RU") : "";
  const matches = (reference: AgentLayerArtifactReference, title = "") =>
    `${title} ${reference.key} ${reference.kind} ${AGENT_LAYER_KIND_LABELS[reference.kind]}`
      .toLocaleLowerCase("ru-RU")
      .includes(needle);
  const relations = {
    incoming: all.incoming.filter((source) => matches(source, source.title)),
    outgoing: outgoing.filter(({ reference, artifact: target }) =>
      matches(reference, target?.title),
    ),
  };
  const systemCapability =
    artifact.kind === "capability_binding"
      ? system.capabilities.find(
          (item) =>
            item.id === artifact.capability.id &&
            item.version === artifact.capability.version,
        )
      : undefined;
  return {
    query,
    setQuery,
    showSearch,
    hasQuery: Boolean(needle),
    totalCount,
    filteredCount: relations.incoming.length + relations.outgoing.length,
    relations,
    systemCapability,
  };
};
