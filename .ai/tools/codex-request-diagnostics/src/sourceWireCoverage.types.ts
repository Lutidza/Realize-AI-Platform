/**
 * @file .ai/tools/codex-request-diagnostics/src/sourceWireCoverage.types.ts
 * @version 1.0.0
 * @date 2026-11-19
 * @description Определяет evidence доставки публичных инструкций в model-visible поля запроса.
 */
import type { SmokeSourceProof } from "./smokeCoverage.types.ts";
/** Только HMAC identity и закрытые метрики реально доставленного inspect JSON. */
export interface SourceWireInspectReportProof {
  itemHash: string;
  ordinal: number;
  shape: "summary" | "full";
  jsonBytes: number;
  reportedCount: number;
  truncated: boolean;
}
export interface SourceWireSnapshot {
  /** Numeric proofs одного request; использование generation подтверждается отдельно. */
  readLines: number;
  skillTextFragments: number;
  scanIncomplete: boolean;
  sourceProofs: SmokeSourceProof[];
  inspectReports: SourceWireInspectReportProof[];
}
