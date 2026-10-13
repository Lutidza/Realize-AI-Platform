/**
 * @file tests/e2e/support/taskManagerAcceptance/FixtureProcessContainment.adapter.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Ограничивает остановку writers доказанной transient cgroup fixture.
 * @see documentation/specifications/task-management-execution.md
 */
import { statSync } from "node:fs";
import {
  createFixtureProcessStarter,
  readFixtureProcessIdentity,
  scanFixtureProcesses,
  sameFixtureProcessIdentity as sameFixtureIdentity,
} from "./FixtureProcess.adapter";
import {
  readFixtureCgroup,
  readFixtureCgroupMembers,
  readFixtureContainmentProof,
} from "./FixtureContainmentProof.adapter";
import type {
  FixtureProcessIdentity,
  FixtureProcessSnapshot,
  FixtureProcessStopResult,
} from "./FixtureProcess.types";
import type {
  FixtureContainmentRuntime,
  FixtureProcessContainment,
  FixtureProcessContainmentGuard,
} from "./FixtureProcessContainment.types";

/** Опциональный transport: absent env сохраняет baseline, invalid explicit unit останавливает запуск. */
export function createFixtureProcessContainment(
  env: NodeJS.ProcessEnv = process.env,
  runtime: FixtureContainmentRuntime = {},
): FixtureProcessContainment | undefined {
  const unit = env.TASK_BROWSER_SUPERVISOR_UNIT;
  if (unit === undefined) return undefined;
  let original: ReturnType<typeof readFixtureContainmentProof>;
  try {
    original = readFixtureContainmentProof(unit, runtime);
  } catch {
    throw new Error("FIXTURE_CONTAINMENT_PROOF_INVALID");
  }
  const readIdentity = runtime.readIdentity ?? readFixtureProcessIdentity;
  const readCgroup = runtime.readCgroup ?? readFixtureCgroup;
  const readUid =
    runtime.readUid ?? ((pid: number) => statSync(`/proc/${pid}`).uid);
  const scanGlobal = runtime.scanProcesses ?? scanFixtureProcesses;
  const readMembers = runtime.readMembers ?? readFixtureCgroupMembers;
  const scanProcesses = (): FixtureProcessSnapshot => {
    try {
      const members = readMembers(original.cgroup);
      const snapshot = scanGlobal();
      const identities = new Map(
        snapshot.processes.map((identity) => [identity.pid, identity]),
      );
      let inaccessible = snapshot.inaccessible;
      for (const pid of members) {
        const identity = readIdentity(pid);
        if (identity) identities.set(pid, identity);
      }
      const fresh = readMembers(original.cgroup);
      if (
        fresh.length !== members.length ||
        fresh.some((pid) => !members.includes(pid))
      )
        inaccessible = true;
      for (const pid of fresh) if (!identities.has(pid)) inaccessible = true;
      return { processes: [...identities.values()], inaccessible };
    } catch {
      return { processes: [], inaccessible: true };
    }
  };
  const signalPid =
    runtime.signalPid ??
    ((pid: number, signal: NodeJS.Signals) => process.kill(pid, signal));
  const guard: FixtureProcessContainmentGuard = {
    verify() {
      try {
        const current = readFixtureContainmentProof(unit, runtime);
        return (
          current.cgroup === original.cgroup &&
          current.uid === original.uid &&
          current.ancestors.length === original.ancestors.length &&
          current.ancestors.every((identity, index) =>
            sameFixtureIdentity(identity, original.ancestors[index]),
          )
        );
      } catch {
        return false;
      }
    },
    membership(expected) {
      try {
        const current = readIdentity(expected.pid);
        if (!current) return "foreign";
        if (
          !sameFixtureIdentity(expected, current) ||
          readUid(expected.pid) !== original.uid
        )
          return "unknown";
        const cgroup = readCgroup(expected.pid);
        const verified = readIdentity(expected.pid);
        if (!verified || !sameFixtureIdentity(expected, verified))
          return "unknown";
        // Delegate=no: nested cgroup не создаётся transport; неожиданное вложение считается unknown.
        if (cgroup.startsWith(`${original.cgroup}/`)) return "unknown";
        return cgroup === original.cgroup ? "owned" : "foreign";
      } catch {
        return "unknown";
      }
    },
  };
  const protectedAncestor = (identity: FixtureProcessIdentity) =>
    original.ancestors.some((ancestor) =>
      sameFixtureIdentity(identity, ancestor),
    );
  const live = (identity: FixtureProcessIdentity) =>
    !["Z", "X"].includes(identity.state);
  const observedWriters = new Map<number, FixtureProcessIdentity>();
  const inspect = (): {
    result: FixtureProcessStopResult;
    writers: FixtureProcessIdentity[];
  } => {
    if (!guard.verify())
      return {
        result: {
          quiescent: false,
          reason: "fixture_containment_proof_changed",
        },
        writers: [],
      };
    let snapshot: FixtureProcessSnapshot;
    try {
      snapshot = scanProcesses();
    } catch {
      snapshot = { processes: [], inaccessible: true };
    }
    if (snapshot.inaccessible)
      return {
        result: {
          quiescent: false,
          reason: "fixture_containment_scan_inaccessible",
        },
        writers: [],
      };
    const writers: FixtureProcessIdentity[] = [];
    for (const identity of snapshot.processes) {
      if (!live(identity)) continue;
      const membership = guard.membership(identity);
      if (membership === "unknown")
        return {
          result: {
            quiescent: false,
            reason: "fixture_containment_membership_unknown",
          },
          writers: [],
        };
      if (membership === "owned" && !protectedAncestor(identity)) {
        observedWriters.set(identity.pid, { ...identity });
        writers.push(identity);
      }
      const observed = observedWriters.get(identity.pid);
      if (
        membership === "foreign" &&
        observed &&
        sameFixtureIdentity(observed, identity)
      )
        return {
          result: {
            quiescent: false,
            reason: "fixture_containment_descendant_escaped",
          },
          writers: [],
        };
    }
    for (const expected of observedWriters.values()) {
      try {
        const current = readIdentity(expected.pid);
        if (
          !current ||
          !sameFixtureIdentity(current, expected) ||
          !live(current)
        )
          continue;
        const membership = guard.membership(current);
        if (membership !== "owned")
          return {
            result: {
              quiescent: false,
              reason:
                membership === "foreign"
                  ? "fixture_containment_descendant_escaped"
                  : "fixture_containment_membership_unknown",
            },
            writers: [],
          };
      } catch {
        return {
          result: {
            quiescent: false,
            reason: "fixture_containment_membership_unknown",
          },
          writers: [],
        };
      }
    }
    return {
      result: writers.length
        ? { quiescent: false, reason: "fixture_containment_writers_live" }
        : { quiescent: true },
      writers,
    };
  };
  const signal = (value: NodeJS.Signals) => {
    const snapshot = inspect();
    for (const expected of snapshot.writers) {
      if (!guard.verify()) break;
      const current = readIdentity(expected.pid);
      if (
        !current ||
        !sameFixtureIdentity(current, expected) ||
        protectedAncestor(current) ||
        guard.membership(current) !== "owned"
      )
        continue;
      try {
        signalPid(current.pid, value);
      } catch {
        /* Следующий inspect подтверждает exit; сам сигнал не является quiescence. */
      }
    }
  };
  const wait = async (duration: number) => {
    const deadline = Date.now() + duration;
    let status = inspect().result;
    while (!status.quiescent && Date.now() < deadline) {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(runtime.pollMs ?? 40, deadline - Date.now()),
        ),
      );
      status = inspect().result;
    }
    return status;
  };
  return {
    unit,
    controlGroup: original.cgroup,
    startProcess: createFixtureProcessStarter({
      containment: guard,
      readIdentity: runtime.readIdentity,
      scanProcesses,
      signalPid: runtime.signalPid,
      termGraceMs: runtime.termGraceMs,
      killWaitMs: runtime.killWaitMs,
      pollMs: runtime.pollMs,
    }),
    async reapResidualWriters() {
      signal("SIGTERM");
      const status = await wait(runtime.termGraceMs ?? 2000);
      if (status.quiescent) return status;
      signal("SIGKILL");
      return wait(runtime.killWaitMs ?? 3000);
    },
  };
}
