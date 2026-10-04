/**
 * @file services/ai-control-plane/src/RepositoryChatTools.types.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Задаёт server-owned зависимости actual-files поиска в одном Admin run.
 * @see documentation/architecture/repository-search.md
 */
import type { SearchObservation } from "@realize/ai-contracts";
import type { RepositoryReadPolicy } from "./RepositoryRead.types";
import type { ControlPlaneRun } from "./runStore";

export type RepositoryChatToolsOptions = {
  policy: RepositoryReadPolicy;
  run: Pick<ControlPlaneRun, "id" | "cancelRequested">;
  signal?: AbortSignal;
  /** MCP text+structuredContent используют меньший общий envelope budget, чем dynamic function. */
  responseBytes?: number;
  consumer?: "admin" | "execution" | "review";
  sourceVersion?: string;
  installedBuildID?: string;
  observe?: (event: SearchObservation) => void;
};
