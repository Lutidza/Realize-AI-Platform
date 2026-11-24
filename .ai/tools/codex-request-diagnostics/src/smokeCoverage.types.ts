/**
 * @file .ai/tools/codex-request-diagnostics/src/smokeCoverage.types.ts
 * @version 1.0.0
 * @date 2026-11-20
 * @description Определяет безопасное evidence чтений и единственного программного inspect.
 */
export interface SmokeSource {
  path: string;
  section?: string;
  first: number;
  last: number;
  lines: string[];
}

export interface SmokeSourceProof {
  source: number;
  first: number;
  last: number;
  bytes: number;
}

/** Закрытые причины отказа reader не содержат command, stdout или тексты ошибок. */
export type SmokeReaderFailureReason =
  | "execution_failed"
  | "output_truncated"
  | "command_not_allowed"
  | "packet_invalid";

export interface SmokeReaderDiagnostic {
  call: number;
  status: "completed" | "failed" | "in_progress" | "unknown";
  exitCode: number | null;
  outputBytes: number;
  errorCode: "INVALID_INPUT" | "READ_FAILED" | "LINE_TOO_LARGE" | null;
  reasons: SmokeReaderFailureReason[];
}

/** Только размеры, фиксированный projection kind и counts; имена статусов и paths не копируются. */
export interface SmokeInspectDiagnostic {
  call: number;
  outputBytes: number;
  /** Размер единственной JSON report line без завершающего LF. */
  reportBytes: number | null;
  reportCount: number;
  projectionKind: "git-inspect-summary" | "unknown" | null;
  normalized: boolean;
  reportedCount: number | null;
  statusGroups: number | null;
  statusCountSum: number | null;
  truncated: boolean | null;
  totalCount: number | null;
  pathsOmitted: boolean;
}

export interface SmokeCoverageSnapshot {
  commands: number;
  /** Проверка runtime остаётся обязательной, но выполняется с первым inspect без отдельного model roundtrip. */
  runtimeChecks: number;
  runtimeChecksPassed: number;
  runtimeChecksCombined: number;
  reads: number;
  readLines: number;
  duplicateLines: number;
  invalidReads: number;
  maxPacketBytes: number;
  pendingCount: number;
  sourceProofs: SmokeSourceProof[];
  readerDiagnostics: SmokeReaderDiagnostic[];
  readerDiagnosticsDropped: number;
  inspectCount: number;
  inspectCompactCount: number;
  inspectDiagnostics: SmokeInspectDiagnostic[];
  inspectDiagnosticsDropped: number;
  inspectSucceeded: boolean;
  inspectFingerprintHash: string | null;
  inspectFingerprintHashes: string[];
  inspectSuccessfulCount: number;
  inspectReportedCount: number | null;
  inspectTruncated: boolean | null;
  modelWorkerUsed: boolean;
}
