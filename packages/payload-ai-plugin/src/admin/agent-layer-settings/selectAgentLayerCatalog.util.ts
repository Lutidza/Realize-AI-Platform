/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/selectAgentLayerCatalog.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Отбирает и сортирует записи каталога с точными счётчиками и страницами.
 */

import type {
  AIConfigArtifact,
  AIConfigArtifactKind,
} from "@realize/ai-contracts";
import type {
  AgentLayerCatalogSelection,
  AgentLayerCatalogState,
} from "./AgentLayerCatalog.types";
import { AGENT_LAYER_KIND_LABELS } from "./agentLayerPresentation.util";
import { buildAgentLayerArtifactRelationIndex } from "./getAgentLayerArtifactRelations.util";
import { getAgentLayerArtifactSummary } from "./getAgentLayerArtifactSummary.util";

/** Страница начинается с 1; после изменения данных возвращается ближайшая доступная. */
export const selectAgentLayerCatalog = (
  artifacts: readonly AIConfigArtifact[],
  state: AgentLayerCatalogState,
  kind?: AIConfigArtifactKind,
): AgentLayerCatalogSelection => {
  const query = state.search.trim().toLocaleLowerCase("ru-RU");
  const relations = buildAgentLayerArtifactRelationIndex(artifacts);
  const section = kind
    ? artifacts.filter((artifact) => artifact.kind === kind)
    : artifacts;
  const rows = section
    .map((artifact) => ({
      artifact,
      summary: getAgentLayerArtifactSummary(artifact),
      usageCount:
        relations.get(`${artifact.kind}:${artifact.key}`)?.incoming.length ?? 0,
    }))
    .filter(({ artifact, summary, usageCount }) => {
      if (
        state.status !== "all" &&
        artifact.enabled !== (state.status === "enabled")
      )
        return false;
      if (state.usage === "used" && usageCount === 0) return false;
      if (state.usage === "unused" && usageCount > 0) return false;
      return `${artifact.title} ${artifact.key} ${AGENT_LAYER_KIND_LABELS[artifact.kind]} ${summary}`
        .toLocaleLowerCase("ru-RU")
        .includes(query);
    })
    .sort((left, right) => {
      const primary =
        state.sort === "revision"
          ? right.artifact.revision - left.artifact.revision
          : state.sort === "usage"
            ? right.usageCount - left.usageCount
            : 0;
      return (
        primary ||
        (left.artifact.title || left.artifact.key).localeCompare(
          right.artifact.title || right.artifact.key,
          "ru-RU",
          { numeric: true },
        ) ||
        left.artifact.kind.localeCompare(right.artifact.kind) ||
        left.artifact.key.localeCompare(right.artifact.key)
      );
    });
  const pageCount = Math.max(1, Math.ceil(rows.length / 25));
  const requestedPage = Number.isFinite(state.page)
    ? Math.floor(state.page)
    : 1;
  const page = Math.min(pageCount, Math.max(1, requestedPage));
  const offset = (page - 1) * 25;
  return {
    rows: rows.slice(offset, offset + 25),
    totalCount: section.length,
    filteredCount: rows.length,
    page,
    pageCount,
    rangeStart: rows.length ? offset + 1 : 0,
    rangeEnd: Math.min(offset + 25, rows.length),
    hasFilters:
      Boolean(query) || state.status !== "all" || state.usage !== "all",
  };
};
