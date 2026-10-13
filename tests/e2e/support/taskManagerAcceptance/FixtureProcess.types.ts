/**
 * @file tests/e2e/support/taskManagerAcceptance/FixtureProcess.types.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Описывает владение процессом браузерной fixture и результат подтверждённой остановки.
 * @see documentation/specifications/task-management-execution.md
 */
import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import type { FixtureProcessContainmentGuard } from "./FixtureProcessContainment.types";

/** Настройки собственного процесса; секреты env редактируются перед журналированием. */
export interface FixtureProcessOptions {
  env: NodeJS.ProcessEnv;
  cwd?: string;
  logFile?: string;
}

/** Quiescence требует закрытых streams и отсутствия owned/неоднозначных новых same-UID процессов. */
export interface FixtureProcessStopResult {
  quiescent: boolean;
  reason?: string;
}

/** done не отклоняется: spawn failure и завершение сигналом дают null. stop идемпотентен. */
export interface FixtureProcessHandle {
  child: ChildProcessByStdio<null, Readable, Readable>;
  done: Promise<number | null>;
  stop(): Promise<FixtureProcessStopResult>;
  /** После stop повторяет проверки с ограниченным ожиданием, без новых сигналов. */
  confirmQuiescence(): Promise<FixtureProcessStopResult>;
}

/** Linux stat identity включает настоящие process group/session, не значения, выведенные из PID. */
export interface FixtureProcessIdentity {
  pid: number;
  parentPid: number;
  groupId: number;
  sessionId: number;
  bootId: string;
  startTicks: string;
  state: string;
}

export interface FixtureProcessSnapshot {
  processes: FixtureProcessIdentity[];
  inaccessible: boolean;
}

/** Узкая инфраструктурная инъекция для проверки отказов identity без сигналов чужим процессам. */
export interface FixtureProcessRuntime {
  containment?: FixtureProcessContainmentGuard;
  executable?: string;
  readIdentity?: (pid: number) => FixtureProcessIdentity | null;
  scanProcesses?: () => FixtureProcessSnapshot;
  signalGroup?: (groupId: number, signal: NodeJS.Signals) => void;
  signalPid?: (pid: number, signal: NodeJS.Signals) => void;
  termGraceMs?: number;
  killWaitMs?: number;
  confirmWaitMs?: number;
  pollMs?: number;
}

export interface FixtureProcessLog {
  write(chunk: Buffer, channel: "stdout" | "stderr"): void;
  finish(): void;
  isClosed(): boolean;
  hasFailed(): boolean;
}
