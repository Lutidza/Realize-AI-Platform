/**
 * @file .ai/tools/codex-request-diagnostics/src/codexExec.types.ts
 * @version 1.0.0
 * @date 2026-11-19
 * @description Определяет RAM-only stock exec и безопасные metadata результата без native payload.
 */
export type CodexExecFailureCode =
  | "exec_input_invalid"
  | "exec_spawn_failed"
  | "exec_process_failed"
  | "exec_unsafe_logging_configuration"
  | "exec_process_tracking_unavailable"
  | "exec_output_invalid"
  | "exec_output_limit"
  | "exec_callback_failed"
  | "exec_stdin_failed"
  | "exec_stream_failed"
  | "exec_timeout"
  | "exec_cleanup_failed";

/** Parsed events доступны только callback в RAM; reasoning items отбрасываются адаптером. */
export interface CodexExecOptions {
  cwd: string;
  prompt: string;
  environment: Readonly<Record<string, string | undefined>>;
  event(type: string, event: Readonly<Record<string, unknown>>): void;
  started(pid: number): void;
}

export interface CodexExecResult {
  pid: number | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  exitObserved: boolean;
  timedOut: boolean;
  groupStopped: boolean;
  errorCode: CodexExecFailureCode | null;
  eventCount: number;
}

export interface CodexExecProcessIdentity {
  pid: number;
  parent: number;
  group: number;
  startTicks: string;
  state: string;
}
