/**
 * @file services/ai-control-plane/src/RepositoryQueries.types.ts
 * @version 1.2.0
 * @date 2026-09-28
 * @description Описывает контекст поиска и выводит тип совпадения из общего wire-контракта.
 */
import type { RepositoryReadPolicy } from "./RepositoryRead.types";
import type { RepositoryCursorService } from "./RepositoryCursor.service";
import type { z } from "zod";
import type { mcpToolDataSchemas } from "../../../packages/ai-contracts/src/mcpToolOutputs.config";
export type RepositoryQueryContext = {
  policy: RepositoryReadPolicy;
  principal: string;
  cursors: RepositoryCursorService;
  signal?: AbortSignal;
  responseBytes?: number;
  searchMetrics?: RepositorySearchMetrics;
};
export type RepositorySearchMetrics = {
  started: number;
  firstMatchMs: number | null;
  candidateFiles: number | null;
  filesRead: number;
  bytesRead: number;
  excludedFiles: number;
};
export type RepositorySearchMatch = z.output<
  typeof mcpToolDataSchemas.repo_search
>["matches"][number];
