/**
 * @file services/ai-control-plane/src/RepositoryQueries.types.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Описывает контекст выдачи файлов и совпадения буквального поиска.
 */
import type { RepositoryReadPolicy } from "./RepositoryRead.types";
import type { RepositoryCursorService } from "./RepositoryCursor.service";
export type RepositoryQueryContext = {
  policy: RepositoryReadPolicy;
  principal: string;
  cursors: RepositoryCursorService;
  signal?: AbortSignal;
  responseBytes?: number;
};
export type RepositorySearchMatch = {
  path: string;
  line: number;
  column: number;
  snippet: string;
  fileSha256: string;
};
