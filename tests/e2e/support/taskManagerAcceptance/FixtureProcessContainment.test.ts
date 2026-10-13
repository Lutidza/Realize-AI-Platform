/**
 * @file tests/e2e/support/taskManagerAcceptance/FixtureProcessContainment.test.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Проверяет transient cgroup proof, запрет чужих сигналов и остановку собственных orphan writers.
 * @see documentation/specifications/task-management-execution.md
 */
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createFixtureProcessContainment } from "./FixtureProcessContainment.adapter";
import {
  createFixtureProcessStarter,
  readFixtureProcessIdentity,
} from "./FixtureProcess.adapter";
import type { FixtureProcessIdentity } from "./FixtureProcess.types";
import type {
  FixtureContainmentRuntime,
  FixtureContainmentUnit,
} from "./FixtureProcessContainment.types";

const unit = "realize-fixture-task-browser-proof.service";
const cgroup = `/user.slice/user-1000.slice/user@1000.service/app.slice/${unit}`;
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  TASK_BROWSER_SUPERVISOR_UNIT: unit,
};

function identity(pid: number, parentPid: number): FixtureProcessIdentity {
  return {
    pid,
    parentPid,
    groupId: pid,
    sessionId: pid,
    bootId: "test-boot",
    startTicks: String(pid * 100),
    state: "S",
  };
}

function harness() {
  const metadata: FixtureContainmentUnit = {
    id: unit,
    controlGroup: cgroup,
    mainPid: 90,
    transient: true,
    delegate: false,
    loaded: true,
  };
  const processes = new Map([
    [90, identity(90, 1)],
    [100, identity(100, 90)],
  ]);
  const memberships = new Map([
    [90, cgroup],
    [100, cgroup],
  ]);
  const signals: Array<{ pid: number; signal: NodeJS.Signals }> = [];
  let inaccessible = false;
  const runtime: FixtureContainmentRuntime = {
    pid: 100,
    uid: 1000,
    readUnit: () => ({ ...metadata }),
    readIdentity: (pid) => processes.get(pid) ?? null,
    readUid: () => 1000,
    readCgroup(pid) {
      const path = memberships.get(pid);
      if (!path) throw new Error("membership unavailable");
      return path;
    },
    readMembers: () =>
      [...processes.keys()].filter((pid) => memberships.get(pid) === cgroup),
    scanProcesses: () => ({ processes: [...processes.values()], inaccessible }),
    signalPid(pid, signal) {
      signals.push({ pid, signal });
      processes.delete(pid);
    },
    termGraceMs: 0,
    killWaitMs: 0,
    pollMs: 1,
  };
  return {
    metadata,
    processes,
    memberships,
    signals,
    runtime,
    setInaccessible: () => {
      inaccessible = true;
    },
  };
}

test("absent supervisor env keeps default transport; explicit empty env fails closed", () => {
  assert.equal(
    createFixtureProcessContainment({ NODE_ENV: "test" }),
    undefined,
  );
  assert.throws(
    () =>
      createFixtureProcessContainment({
        ...env,
        TASK_BROWSER_SUPERVISOR_UNIT: "",
      }),
    /FIXTURE_CONTAINMENT_PROOF_INVALID/,
  );
});

for (const mutation of [
  (value: FixtureContainmentUnit) => {
    value.id = "realize-web.service";
  },
  (value: FixtureContainmentUnit) => {
    value.transient = false;
  },
  (value: FixtureContainmentUnit) => {
    value.delegate = true;
  },
  (value: FixtureContainmentUnit) => {
    value.loaded = false;
  },
  (value: FixtureContainmentUnit) => {
    value.mainPid = 400;
  },
  (value: FixtureContainmentUnit) => {
    value.controlGroup = `/user.slice/user-1001.slice/user@1001.service/app.slice/${unit}`;
  },
]) {
  test(`invalid unit property ${mutation.toString()} prevents containment and signals`, () => {
    const state = harness();
    mutation(state.metadata);
    assert.throws(
      () => createFixtureProcessContainment(env, state.runtime),
      /FIXTURE_CONTAINMENT_PROOF_INVALID/,
    );
    assert.deepEqual(state.signals, []);
  });
}

test("fixture cgroup, ancestor UID and ancestor boot must match proof", () => {
  for (const kind of ["cgroup", "uid", "boot", "reused"] as const) {
    const state = harness();
    if (kind === "cgroup") state.memberships.set(100, "/foreign.service");
    if (kind === "uid")
      state.runtime.readUid = (pid) => (pid === 90 ? 1001 : 1000);
    if (kind === "boot") state.processes.get(90)!.bootId = "other-boot";
    if (kind === "reused") {
      let reads = 0;
      state.runtime.readIdentity = (pid) => {
        const value = state.processes.get(pid);
        if (!value) return null;
        return pid === 100 && ++reads > 1
          ? { ...value, startTicks: "different" }
          : value;
      };
    }
    assert.throws(
      () => createFixtureProcessContainment(env, state.runtime),
      /FIXTURE_CONTAINMENT_PROOF_INVALID/,
    );
    assert.deepEqual(state.signals, []);
  }
});

test("reparenting during ancestry read cannot retain earlier parent proof", () => {
  const state = harness();
  let reads = 0;
  state.runtime.readIdentity = (pid) => {
    const value = state.processes.get(pid);
    if (!value) return null;
    return pid === 100 && ++reads > 1 ? { ...value, parentPid: 80 } : value;
  };
  assert.throws(
    () => createFixtureProcessContainment(env, state.runtime),
    /FIXTURE_CONTAINMENT_PROOF_INVALID/,
  );
  assert.deepEqual(state.signals, []);
});

test("reaper signals own orphan session but preserves foreign PID and wrapper ancestors", async () => {
  const state = harness();
  state.processes.set(300, identity(300, 1));
  state.memberships.set(300, cgroup);
  state.processes.set(400, identity(400, 1));
  state.memberships.set(400, "/foreign.service");
  const scope = createFixtureProcessContainment(env, state.runtime)!;
  assert.deepEqual(await scope.reapResidualWriters(), { quiescent: true });
  assert.deepEqual(state.signals, [{ pid: 300, signal: "SIGTERM" }]);
  assert.ok(
    state.processes.has(90) &&
      state.processes.has(100) &&
      state.processes.has(400),
  );
});

test("live own writer ignoring TERM is individually escalated to KILL", async () => {
  const state = harness();
  state.processes.set(300, identity(300, 1));
  state.memberships.set(300, cgroup);
  state.runtime.signalPid = (pid, signal) => {
    state.signals.push({ pid, signal });
    if (signal === "SIGKILL") state.processes.delete(pid);
  };
  const scope = createFixtureProcessContainment(env, state.runtime)!;
  assert.deepEqual(await scope.reapResidualWriters(), { quiescent: true });
  assert.deepEqual(state.signals, [
    { pid: 300, signal: "SIGTERM" },
    { pid: 300, signal: "SIGKILL" },
  ]);
});

test("changed MainPID identity invalidates captured proof before any signals", async () => {
  const state = harness();
  const scope = createFixtureProcessContainment(env, state.runtime)!;
  state.processes.get(90)!.startTicks = "reused";
  assert.deepEqual(await scope.reapResidualWriters(), {
    quiescent: false,
    reason: "fixture_containment_proof_changed",
  });
  assert.deepEqual(state.signals, []);
});

test("inaccessible scan and unknown membership preserve own writers without signals", async () => {
  for (const kind of ["scan", "membership", "nested"] as const) {
    const state = harness();
    state.processes.set(300, identity(300, 1));
    state.memberships.set(300, cgroup);
    const scope = createFixtureProcessContainment(env, state.runtime)!;
    if (kind === "scan") state.setInaccessible();
    if (kind === "membership") state.memberships.delete(300);
    if (kind === "nested") state.memberships.set(300, `${cgroup}/unexpected`);
    const status = await scope.reapResidualWriters();
    assert.equal(status.quiescent, false);
    assert.equal(
      status.reason,
      kind === "scan"
        ? "fixture_containment_scan_inaccessible"
        : "fixture_containment_membership_unknown",
    );
    assert.deepEqual(state.signals, []);
  }
});

test("membership changing to foreign between inspection and signal never authorizes that signal", async () => {
  const state = harness();
  state.processes.set(300, identity(300, 1));
  state.memberships.set(300, cgroup);
  let reads = 0;
  state.runtime.readCgroup = (pid) =>
    pid === 300 && ++reads > 1
      ? "/foreign.service"
      : state.memberships.get(pid)!;
  const scope = createFixtureProcessContainment(env, state.runtime)!;
  assert.deepEqual(await scope.reapResidualWriters(), {
    quiescent: false,
    reason: "fixture_containment_descendant_escaped",
  });
  assert.deepEqual(state.signals, []);
  assert.ok(state.processes.has(300));
});

test("cgroup census covers foreign-UID writer missing from same-UID global scan", async () => {
  const state = harness();
  state.processes.set(300, identity(300, 1));
  state.memberships.set(300, cgroup);
  state.runtime.readUid = (pid) => (pid === 300 ? 1001 : 1000);
  state.runtime.scanProcesses = () => ({
    processes: [...state.processes.values()].filter(
      (value) => value.pid !== 300,
    ),
    inaccessible: false,
  });
  const scope = createFixtureProcessContainment(env, state.runtime)!;
  assert.deepEqual(await scope.reapResidualWriters(), {
    quiescent: false,
    reason: "fixture_containment_membership_unknown",
  });
  assert.deepEqual(state.signals, []);
  assert.ok(state.processes.has(300));
});

test("changing or unreadable cgroup census cannot establish quiescence", async () => {
  for (const unavailable of [false, true]) {
    const state = harness();
    let reads = 0;
    state.runtime.readMembers = () => {
      if (unavailable) throw new Error("census inaccessible");
      return ++reads % 2 ? [90, 100] : [90, 100, 300];
    };
    const scope = createFixtureProcessContainment(env, state.runtime)!;
    assert.deepEqual(await scope.reapResidualWriters(), {
      quiescent: false,
      reason: "fixture_containment_scan_inaccessible",
    });
    assert.deepEqual(state.signals, []);
  }
});

test("scoped starter ignores proven foreign unowned identity while default guard still blocks it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fixture-scope-test-"));
  try {
    for (const scoped of [true, false]) {
      let leader: FixtureProcessIdentity | null = null;
      let late = false;
      const foreign = identity(4000000, 1);
      const signals: number[] = [];
      const handle = createFixtureProcessStarter({
        readIdentity(pid) {
          leader = readFixtureProcessIdentity(pid);
          return leader;
        },
        scanProcesses: () => ({
          processes: [
            ...(leader && readFixtureProcessIdentity(leader.pid)
              ? [leader]
              : []),
            ...(late ? [foreign] : []),
          ],
          inaccessible: false,
        }),
        containment: scoped
          ? {
              verify: () => true,
              membership: (value) =>
                value.pid === foreign.pid ? "foreign" : "owned",
            }
          : undefined,
        signalPid: (pid, signal) => {
          signals.push(pid);
          process.kill(pid, signal);
        },
        termGraceMs: 50,
        killWaitMs: 50,
        pollMs: 1,
      })(["--eval", "process.exit(0)"], {
        env: { NODE_ENV: "test" },
        logFile: join(directory, `scoped-${scoped}.log`),
      });
      assert.equal(await handle.done, 0);
      late = true;
      assert.deepEqual(
        await handle.stop(),
        scoped
          ? { quiescent: true }
          : {
              quiescent: false,
              reason: "fixture_process_new_identity_unowned",
            },
      );
      assert.deepEqual(signals, []);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("scoped starter never group-signals a foreign member; known escaped identity keeps cleanup blocked", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fixture-scope-signal-"));
  let handle:
    ReturnType<ReturnType<typeof createFixtureProcessStarter>> | undefined;
  try {
    let leader: FixtureProcessIdentity | null = null;
    const foreign = {
      identity: undefined as FixtureProcessIdentity | undefined,
    };
    const pids: number[] = [];
    const groups: number[] = [];
    handle = createFixtureProcessStarter({
      readIdentity(pid) {
        if (pid === foreign.identity?.pid) return foreign.identity!;
        const value = readFixtureProcessIdentity(pid);
        if (!leader && value) leader = value;
        return value;
      },
      scanProcesses: () => ({
        processes: [
          ...(leader && readFixtureProcessIdentity(leader.pid) ? [leader] : []),
          ...(foreign.identity ? [foreign.identity] : []),
        ],
        inaccessible: false,
      }),
      containment: {
        verify: () => true,
        membership: (value) =>
          value.pid === foreign.identity?.pid ? "foreign" : "owned",
      },
      signalPid(pid, signal) {
        pids.push(pid);
        process.kill(pid, signal);
      },
      signalGroup(group) {
        groups.push(group);
      },
      termGraceMs: 20,
      killWaitMs: 20,
      pollMs: 1,
    })(["--eval", "console.log('ready'); setInterval(() => {}, 1000)"], {
      env: { NODE_ENV: "test" },
      logFile: join(directory, "signal.log"),
    });
    await once(handle.child.stdout, "data");
    const currentLeader = leader as FixtureProcessIdentity | null;
    assert.ok(currentLeader);
    foreign.identity = {
      ...identity(4000000, 1),
      bootId: currentLeader.bootId,
      sessionId: currentLeader.sessionId,
      groupId: currentLeader.groupId,
    };
    assert.deepEqual(await handle.stop(), {
      quiescent: false,
      reason: "fixture_process_descendant_escaped",
    });
    await handle.done;
    assert.ok(pids.length > 0);
    assert.ok(pids.every((pid) => pid === handle!.child.pid));
    assert.deepEqual(groups, []);
  } finally {
    if (
      handle &&
      handle.child.exitCode === null &&
      handle.child.signalCode === null
    ) {
      handle.child.kill("SIGKILL");
      await handle.done;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
