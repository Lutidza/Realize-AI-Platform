/**
 * @file .ai/tools/agent-search/src/loadImportConfiguration.service.d.mts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Описывает общий effective config и его происхождение для поисковых и mutation consumers.
 */
import type {
  ImportReadContext,
  SynchronousImportReadContext,
  ImportConfigurationResult,
} from "./ImportResolution.types.d.mts";
export function loadImportConfiguration(
  context: ImportReadContext,
  fromPath: string,
  configPath?: string,
): Promise<ImportConfigurationResult>;
export function loadImportConfigurationSync(
  context: SynchronousImportReadContext,
  fromPath: string,
  configPath?: string,
): ImportConfigurationResult;
