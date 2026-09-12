/**
 * @file services/ai-control-plane/src/ProjectContext.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Описывает проверенные байты файлов и жизненный цикл временного контекста.
 */
import type { ProjectContextFileDto } from "@realize/ai-contracts";
export type ProjectContextEntry = { file: ProjectContextFileDto; data: Buffer };
export type ContextSnapshot = {
  cleanup: () => Promise<void>;
  fileCount: number;
  root: string;
  totalBytes: number;
  selectedFiles: ProjectContextFileDto[];
};

export type ProjectContextQuery = {
  query?: string;
  limit?: number;
  paths?: Set<string>;
};
