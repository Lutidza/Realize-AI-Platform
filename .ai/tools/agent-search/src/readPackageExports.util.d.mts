/**
 * @file .ai/tools/agent-search/src/readPackageExports.util.d.mts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Описывает общий selector и точные package exports для relocation policy.
 * @see documentation/architecture/repository-search.md
 */
import type { ImportResolutionReason } from "./ImportResolution.types.d.mts";
export function readPackageExports(
  value: unknown,
):
  | { reason: "unsupported_configuration" | "scan_budget"; targets?: undefined }
  | { reason?: undefined; targets: Map<string, string> };
export function selectPackageExport(
  value: unknown,
  subpath: string,
  conditions: ReadonlySet<string>,
):
  | { target: string; reason?: undefined }
  | { target?: undefined; reason: ImportResolutionReason };
export function isSafePackageTarget(
  value: string,
  requireDot?: boolean,
): boolean;
