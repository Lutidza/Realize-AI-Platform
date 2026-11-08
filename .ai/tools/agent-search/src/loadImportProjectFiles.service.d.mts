/**
 * @file .ai/tools/agent-search/src/loadImportProjectFiles.service.d.mts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Описывает bounded native TypeScript root selection для явного проекта.
 * @see documentation/architecture/repository-search.md
 */
import type {
  ImportResolutionReason,
  SynchronousImportReadContext,
} from "./ImportResolution.types.d.mts";

export function loadImportProjectFilesSync(
  context: SynchronousImportReadContext,
  configPath: string,
  files: ReadonlySet<string>,
):
  | { reason: ImportResolutionReason; files?: undefined }
  | { reason?: undefined; files: string[] };
