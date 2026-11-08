/**
 * @file .ai/tools/agent-search/src/findModuleAliasSpecifiers.util.d.mts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Описывает обратное отображение exact/wildcard paths без чтения или изменения конфигурации.
 */
import type { ImportConfigurationSettings } from "./ImportResolution.types.d.mts";
export function findModuleAliasSpecifiers(
  settings: ImportConfigurationSettings,
  target: string,
  sourceSpecifier?: string,
): string[];
