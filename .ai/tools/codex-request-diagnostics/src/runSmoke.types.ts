/**
 * @file .ai/tools/codex-request-diagnostics/src/runSmoke.types.ts
 * @version 2.0.0
 * @date 2026-11-25
 * @description Определяет закрытый отчёт stock CLI smoke без conversation history и captured payload.
 */
import type { CodexExecResult } from "./codexExec.types.ts";
import type {
  DiagnosticEvent,
  RequestFingerprintEvent,
} from "./requestFingerprint.types.ts";
import type {
  RelayCoverageCode,
  RelayUpstreamAttempt,
  RelayUpstreamFailure,
} from "./diagnosticRelay.types.ts";
import type { SmokeCoverageSnapshot } from "./smokeCoverage.types.ts";
import type { SourceWireSnapshot } from "./sourceWireCoverage.types.ts";
import type { Http2EofDiagnostics } from "./http2Stream.types.ts";

export type SmokeMode = "diagnostic" | "ab";
export type SmokePhase = "setup" | "cleanup" | "D0" | "A1" | "B1" | "A2" | "A3";
export type SmokeFailureCode =
  | "none"
  | "core_dump_not_disabled"
  | "unsafe_trace_environment"
  | "assignment_contract_changed"
  | "smoke_acceptance_failed"
  | "relay_cleanup_failed"
  | "experiment_failed";

export type SmokeObservation =
  | {
      phase: SmokePhase;
      event: DiagnosticEvent;
      skillTextFragments?: number;
      sourceWire?: SourceWireSnapshot;
      physicalConnection?: number;
      streamIndex?: number;
    }
  | {
      phase: SmokePhase;
      event: {
        schemaVersion: 1;
        kind: "relay_coverage";
        connection: number;
        code: RelayCoverageCode;
        http2Eof?: Http2EofDiagnostics;
        upstreamFailure?: RelayUpstreamFailure;
      };
    }
  | {
      phase: SmokePhase;
      event: {
        schemaVersion: 1;
        kind: "relay_upstream_attempt";
      } & RelayUpstreamAttempt;
    }
  | {
      phase: SmokePhase;
      event: {
        schemaVersion: 1;
        kind: "relay_policy_rejection";
        connection: number;
        code: "destination_rejected";
      };
    };

export interface SmokeRequestObservation {
  phase: SmokePhase;
  event: RequestFingerprintEvent;
  skillTextFragments?: number;
  sourceWire?: SourceWireSnapshot;
  physicalConnection?: number;
  streamIndex?: number;
}

export interface SmokeTokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

/** Полнота относится к наблюдённым requests/terminal events, а не к причине backend cache miss. */
export interface SmokeWireSummary {
  generationRequests: number;
  prewarmRequests: number;
  unknownRequests: number;
  fullRequests: number;
  deltaRequests: number;
  unknownInputRequests: number;
  matchedTerminals: number;
  knownTerminals: number;
  unmatchedRequests: number;
  unmatchedTerminals: number;
  unknownUsage: number;
  failedTerminals: number;
  duplicateEvidence: number;
  coverageEvents: number;
  /** CONNECT отклонён до application bytes; не является потерянным model payload. */
  policyRejections: number;
  nativeSkillConfirmed: boolean;
  modelHash: string | null;
  modelVariants: number;
  /** Может быть частичным; число подтверждённых terminal events хранится отдельно. */
  knownUsage: SmokeTokenUsage | null;
  usageMatches: boolean;
}

/** Один CLI invocation; B1 содержит три отдельные Git operations внутри одного user turn. */
export interface SmokePhaseResult {
  phase: Exclude<SmokePhase, "setup" | "cleanup">;
  expectedInspects: number;
  threadHash: string | null;
  threadStarts: number;
  completedTurns: number;
  failedTurns: number;
  nativeEventErrors: number;
  sameInstructions: boolean;
  sameSettings: boolean;
  sameBuild: boolean;
  ephemeralRequested: true;
  upstreamTlsConfirmed: boolean;
  completed: boolean;
  usage: SmokeTokenUsage | null;
  coverage: SmokeCoverageSnapshot;
  visibleSources: SourceWireSnapshot;
  wire: SmokeWireSummary;
  execution: CodexExecResult | null;
  accepted: boolean;
}

export interface SmokeWireInput {
  observations: readonly SmokeObservation[];
  usage: SmokeTokenUsage | null;
  absentModelHash: string;
}
