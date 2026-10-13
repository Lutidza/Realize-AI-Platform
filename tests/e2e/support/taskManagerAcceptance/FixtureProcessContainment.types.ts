/**
 * @file tests/e2e/support/taskManagerAcceptance/FixtureProcessContainment.types.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Описывает доказанное владение transient cgroup браузерной fixture.
 * @see documentation/specifications/task-management-execution.md
 */
import type {
  FixtureProcessIdentity,
  FixtureProcessOptions,
  FixtureProcessHandle,
  FixtureProcessSnapshot,
  FixtureProcessStopResult,
} from "./FixtureProcess.types";

export interface FixtureContainmentUnit {
  id: string;
  controlGroup: string;
  mainPid: number;
  transient: boolean;
  delegate: boolean;
  loaded: boolean;
}

/** Только unified cgroup v2; нечитабельная или неоднозначная membership не даёт владения. */
export type FixtureContainmentMembership = "owned" | "foreign" | "unknown";

/** Bound transport для unit metadata, /proc и индивидуальных сигналов; production defaults Linux/systemd. */
export interface FixtureContainmentRuntime {
  pid?: number;
  uid?: number;
  readUnit?: (unit: string) => FixtureContainmentUnit;
  readIdentity?: (pid: number) => FixtureProcessIdentity | null;
  readCgroup?: (pid: number) => string;
  readUid?: (pid: number) => number;
  /** Полный exact cgroup.procs; nested cgroup или неполное чтение не допускаются. */
  readMembers?: (cgroup: string) => number[];
  scanProcesses?: () => FixtureProcessSnapshot;
  signalPid?: (pid: number, signal: NodeJS.Signals) => void;
  termGraceMs?: number;
  killWaitMs?: number;
  pollMs?: number;
}

/** Proof переоценивается до scan/signaling; membership относится к свежему identity. */
export interface FixtureProcessContainmentGuard {
  verify(): boolean;
  membership(identity: FixtureProcessIdentity): FixtureContainmentMembership;
}

/** Caller сначала останавливает handles и закрывает DB, затем reap и подтверждает quiescence handles. */
export interface FixtureProcessContainment {
  unit: string;
  controlGroup: string;
  startProcess(
    args: string[],
    options: FixtureProcessOptions,
  ): FixtureProcessHandle;
  reapResidualWriters(): Promise<FixtureProcessStopResult>;
}
