/**
 * @file .ai/tools/agent-search/src/resolveModulePath.service.d.mts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Описывает общий resolution и строгую синхронную политику переноса.
 */
import type {
  ImportReadContext,
  SynchronousImportReadContext,
  ModulePathResult,
} from "./ImportResolution.types.d.mts";
export function resolveModulePath(
  context: ImportReadContext,
  fromPath: string,
  specifier: string,
  mode?: "import" | "require",
  configPath?: string,
): Promise<ModulePathResult>;
export function resolveModulePathSync(
  context: SynchronousImportReadContext,
  fromPath: string,
  specifier: string,
  mode?: "import" | "require",
  policy?: "navigation" | "relocation" | "relocation-exports",
  configPath?: string,
): ModulePathResult;
