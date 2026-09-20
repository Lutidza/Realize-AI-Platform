/**
 * @file src/components/admin/task-manager/reference/useWorkspaceCatalog.hook.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Выбирает доступные рабочие среды для каталога с поиском, архивом и сортировкой.
 * @see documentation/specifications/task-management.md
 */

import { useState } from "react";
import {
  getWorkspaceAccess,
  getWorkspaceSummary,
} from "./taskWorkspace.access";
import type { PrototypeState } from "./taskManager.types";

export function useWorkspaceCatalog(state: PrototypeState) {
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState("updated");
  const available = state.workspaces.filter(
    (workspace) => getWorkspaceAccess(state, workspace).canRead,
  );
  const rows = available
    .filter(
      (workspace) =>
        workspace.archived === archived &&
        `${workspace.name} ${workspace.description}`
          .toLocaleLowerCase("ru")
          .includes(query.trim().toLocaleLowerCase("ru")),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "ru")
        : b.updatedAt.localeCompare(a.updatedAt),
    )
    .map((workspace) => ({
      workspace,
      summary: getWorkspaceSummary(state, workspace),
      access: getWorkspaceAccess(state, workspace),
    }));
  return {
    query,
    setQuery,
    archived,
    setArchived,
    sort,
    setSort,
    rows,
    activeCount: available.filter((entry) => !entry.archived).length,
    archiveCount: available.filter((entry) => entry.archived).length,
  };
}
