/**
 * @file .ai/tools/agent-search/src/createImportReadContext.service.d.mts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Описывает общие bounded readers без переноса config grant на исходники.
 */
import type {
  ImportReadAdapter,
  ImportReadContext,
  SynchronousImportReadAdapter,
  SynchronousImportReadContext,
} from "./ImportResolution.types.d.mts";
export function createImportReadContext(
  adapter: ImportReadAdapter,
  assertActive?: () => void,
): ImportReadContext;
export function createImportReadContextSync(
  adapter: SynchronousImportReadAdapter,
  assertActive?: () => void,
): SynchronousImportReadContext;
