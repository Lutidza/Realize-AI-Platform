/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerVersions.hook.ts
 * @version 1.1.0
 * @date 2026-09-10
 * @description Управляет поиском и постраничным просмотром загруженного списка версий.
 */

"use client";

import { useState } from "react";
import type { AIConfigBootstrapDTO } from "@realize/ai-contracts";
import type {
  AgentLayerVersionMode,
  AgentLayerVersionsState,
} from "./AgentLayerVersions.types";

export const useAgentLayerVersions = (
  bootstrap: AIConfigBootstrapDTO,
  controlled?: AgentLayerVersionsState,
  onChange?: (state: AgentLayerVersionsState) => void,
) => {
  const [local, setLocal] = useState<AgentLayerVersionsState>({
    mode: "drafts",
    query: "",
    page: 1,
  });
  const state = controlled ?? local;
  const update = onChange ?? setLocal;
  const { mode, query, page } = state;
  const items = mode === "drafts" ? bootstrap.drafts : bootstrap.releases;
  const filtered = items.filter((item) =>
    `${item.id} ${"version" in item ? item.version : item.revision}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 15));
  const currentPage = Math.min(page, pageCount);
  return {
    mode,
    query,
    page: currentPage,
    pageCount,
    count: filtered.length,
    loadedCount: items.length,
    rows: filtered.slice((currentPage - 1) * 15, currentPage * 15),
    setPage: (value: number) => update({ ...state, page: value }),
    setMode: (value: AgentLayerVersionMode) => {
      update({ mode: value, page: 1, query: "" });
    },
    setQuery: (value: string) => {
      update({ ...state, query: value, page: 1 });
    },
  };
};
