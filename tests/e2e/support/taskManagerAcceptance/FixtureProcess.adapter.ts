/**
 * @file tests/e2e/support/taskManagerAcceptance/FixtureProcess.adapter.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Запускает собственную Linux session fixture и подтверждает остановку всех её writers.
 * @see documentation/specifications/task-management-execution.md
 */
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createFixtureProcessLog } from "./FixtureProcessLog.adapter";
import type {
  FixtureProcessHandle,
  FixtureProcessIdentity,
  FixtureProcessOptions,
  FixtureProcessRuntime,
  FixtureProcessSnapshot,
  FixtureProcessStopResult,
} from "./FixtureProcess.types";

function isGone(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ESRCH")
  );
}

/** Читает stat без cmdline/environment; Z/X не могут продолжать запись артефактов. */
export function readFixtureProcessIdentity(
  pid: number,
): FixtureProcessIdentity | null {
  let raw: string;
  try {
    raw = readFileSync(`/proc/${pid}/stat`, "utf8");
  } catch (error) {
    if (isGone(error)) return null;
    throw new Error("FIXTURE_PROCESS_IDENTITY_UNAVAILABLE");
  }
  try {
    const fields = raw
      .slice(raw.lastIndexOf(")") + 2)
      .trim()
      .split(/\s+/);
    const identity = {
      pid,
      state: fields[0],
      parentPid: Number(fields[1]),
      groupId: Number(fields[2]),
      sessionId: Number(fields[3]),
      startTicks: fields[19],
      bootId: readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim(),
    };
    if (
      !identity.state ||
      !identity.bootId ||
      !/^\d+$/.test(identity.startTicks ?? "") ||
      ![identity.parentPid, identity.groupId, identity.sessionId].every(
        Number.isSafeInteger,
      )
    )
      throw new Error("FIXTURE_PROCESS_IDENTITY_UNAVAILABLE");
    return identity;
  } catch {
    throw new Error("FIXTURE_PROCESS_IDENTITY_UNAVAILABLE");
  }
}

/** Полный доступный same-UID census; inaccessible не скрывается за частичным списком. */
export function scanFixtureProcesses(): FixtureProcessSnapshot {
  const processes: FixtureProcessIdentity[] = [];
  let inaccessible = false;
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      if (statSync(`/proc/${entry}`).uid !== process.getuid?.()) continue;
      const identity = readFixtureProcessIdentity(Number(entry));
      if (identity) processes.push(identity);
    } catch (error) {
      if (!isGone(error)) inaccessible = true;
    }
  }
  return { processes, inaccessible };
}

/** PID без bootId/startTicks не подтверждает тот же процесс после reuse. */
export function sameFixtureProcessIdentity(
  left: FixtureProcessIdentity,
  right: FixtureProcessIdentity,
): boolean {
  return (
    left.pid === right.pid &&
    left.bootId === right.bootId &&
    left.startTicks === right.startTicks
  );
}

function isLive(identity: FixtureProcessIdentity): boolean {
  return identity.state !== "Z" && identity.state !== "X";
}

/** Инъекции ограничены process transport: fixture не получает filesystem producer или DB responsibilities. */
export function createFixtureProcessStarter(
  runtime: FixtureProcessRuntime = {},
) {
  const readIdentity = runtime.readIdentity ?? readFixtureProcessIdentity;
  const scanProcesses = runtime.scanProcesses ?? scanFixtureProcesses;
  const signalGroup =
    runtime.signalGroup ??
    ((groupId: number, signal: NodeJS.Signals) =>
      process.kill(-groupId, signal));
  const pollMs = runtime.pollMs ?? 40;
  const termGraceMs = runtime.termGraceMs ?? 2000;
  const killWaitMs = runtime.killWaitMs ?? 3000;
  const confirmWaitMs = runtime.confirmWaitMs ?? 1000;
  return function start(
    args: string[],
    options: FixtureProcessOptions,
  ): FixtureProcessHandle {
    let baseline: FixtureProcessSnapshot;
    try {
      baseline = scanProcesses();
    } catch {
      baseline = { processes: [], inaccessible: true };
    }
    const previous = new Map(
      baseline.processes.map((identity) => [identity.pid, identity]),
    );
    const log = createFixtureProcessLog(options);
    const child = spawn(runtime.executable ?? process.execPath, args, {
      cwd: options.cwd,
      env: options.env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let closed = false;
    let spawnFailed = false;
    let failureReason: string | undefined;
    // Listeners регистрируются до чтения /proc: быстрый error/exit не создаёт unhandled rejection.
    const done = new Promise<number | null>((resolve) => {
      child.once("error", () => {
        spawnFailed = true;
      });
      child.once("close", (code) => {
        closed = true;
        log.finish();
        resolve(spawnFailed ? null : code);
      });
    });
    child.stdout.on("data", (chunk: Buffer) => log.write(chunk, "stdout"));
    child.stderr.on("data", (chunk: Buffer) => log.write(chunk, "stderr"));
    let leader: FixtureProcessIdentity | null = null;
    try {
      if (process.platform !== "linux")
        throw new Error("FIXTURE_PROCESS_LINUX_REQUIRED");
      if (child.pid) leader = readIdentity(child.pid);
      if (
        child.pid &&
        (!leader ||
          leader.pid !== child.pid ||
          leader.groupId !== child.pid ||
          leader.sessionId !== child.pid)
      )
        failureReason = "fixture_process_identity_unavailable";
    } catch {
      failureReason = "fixture_process_identity_unavailable";
    }
    const owned = new Map<number, FixtureProcessIdentity>();
    if (leader) owned.set(leader.pid, leader);
    let latest: FixtureProcessSnapshot = { processes: [], inaccessible: false };
    const refresh = () => {
      if (!leader || failureReason) return;
      if (runtime.containment && !runtime.containment.verify()) {
        failureReason = "fixture_process_containment_invalid";
        return;
      }
      try {
        latest = scanProcesses();
        const currentLeader = latest.processes.find(
          (identity) => identity.pid === leader!.pid,
        );
        if (
          currentLeader &&
          !sameFixtureProcessIdentity(leader, currentLeader)
        ) {
          failureReason = "fixture_process_identity_changed";
          return;
        }
        // Linux сохраняет ID session/group, пока у неё есть участники, даже после выхода leader.
        for (const identity of latest.processes)
          if (
            identity.sessionId === leader.sessionId &&
            identity.bootId === leader.bootId
          )
            owned.set(identity.pid, identity);
        let changed = true;
        while (changed) {
          changed = false;
          for (const identity of latest.processes) {
            if (owned.has(identity.pid)) continue;
            const parent = owned.get(identity.parentPid);
            const currentParent = latest.processes.find(
              (entry) => entry.pid === identity.parentPid,
            );
            if (
              parent &&
              currentParent &&
              sameFixtureProcessIdentity(parent, currentParent) &&
              identity.bootId === parent.bootId
            ) {
              owned.set(identity.pid, identity);
              changed = true;
            }
          }
        }
      } catch {
        latest = { processes: [], inaccessible: true };
      }
    };
    refresh();
    const monitor = setInterval(refresh, pollMs);
    monitor.unref();
    const currentOwned = () =>
      latest.processes.filter((identity) => {
        const expected = owned.get(identity.pid);
        return (
          expected &&
          sameFixtureProcessIdentity(expected, identity) &&
          isLive(identity)
        );
      });
    const check = (): FixtureProcessStopResult => {
      refresh();
      if (failureReason) return { quiescent: false, reason: failureReason };
      if (!leader && !(spawnFailed && !child.pid))
        return {
          quiescent: false,
          reason: "fixture_process_identity_unavailable",
        };
      if (latest.inaccessible)
        return {
          quiescent: false,
          reason: "fixture_process_scan_inaccessible",
        };
      if (leader && baseline.inaccessible && !runtime.containment)
        return {
          quiescent: false,
          reason: "fixture_process_baseline_inaccessible",
        };
      const live = currentOwned();
      if (runtime.containment) {
        const memberships = latest.processes.filter(isLive).map((identity) => ({
          identity,
          membership: runtime.containment!.membership(identity),
        }));
        if (memberships.some((entry) => entry.membership === "unknown"))
          return {
            quiescent: false,
            reason: "fixture_process_containment_membership_unknown",
          };
        if (
          live.some(
            (identity) => runtime.containment!.membership(identity) !== "owned",
          )
        )
          return {
            quiescent: false,
            reason: "fixture_process_descendant_escaped",
          };
      }
      if (live.some((identity) => identity.sessionId !== leader?.sessionId))
        return {
          quiescent: false,
          reason: "fixture_process_descendant_escaped",
        };
      // Detached writer может стать orphan между polls. Любой новый live same-UID PID,
      // не подтверждённый как owned, считается неоднозначным; параллельный чужой
      // процесс также может удержать tmp, но никогда не получает сигнал fixture.
      if (
        latest.processes.some((identity) => {
          if (!isLive(identity)) return false;
          if (runtime.containment?.membership(identity) === "foreign")
            return false;
          const existing = previous.get(identity.pid);
          const expected = owned.get(identity.pid);
          return (
            !(existing && sameFixtureProcessIdentity(existing, identity)) &&
            !(expected && sameFixtureProcessIdentity(expected, identity))
          );
        })
      )
        return {
          quiescent: false,
          reason: "fixture_process_new_identity_unowned",
        };
      if (live.length)
        return { quiescent: false, reason: "fixture_process_group_live" };
      if (!closed || !log.isClosed())
        return { quiescent: false, reason: "fixture_process_streams_open" };
      if (log.hasFailed())
        return { quiescent: false, reason: "fixture_process_log_failed" };
      return { quiescent: true };
    };
    const signal = (value: NodeJS.Signals) => {
      refresh();
      if (!leader || failureReason || latest.inaccessible) return;
      if (runtime.containment && !runtime.containment.verify()) return;
      if (runtime.containment) {
        // Group signal мог бы затронуть member, сменившего cgroup. В доказанном
        // режиме сигнал получает только отдельный fresh PID+boot/start+membership.
        for (const expected of currentOwned()) {
          if (expected.sessionId !== leader.sessionId) continue;
          try {
            const current = readIdentity(expected.pid);
            if (
              !current ||
              !sameFixtureProcessIdentity(current, expected) ||
              !isLive(current) ||
              current.sessionId !== leader.sessionId ||
              !runtime.containment.verify() ||
              runtime.containment.membership(current) !== "owned"
            )
              continue;
            (runtime.signalPid ?? process.kill)(current.pid, value);
          } catch (error) {
            if (!isGone(error))
              failureReason = "fixture_process_signal_unavailable";
          }
        }
        return;
      }
      const groups = new Set(
        currentOwned()
          .filter((identity) => identity.sessionId === leader.sessionId)
          .map((identity) => identity.groupId),
      );
      for (const groupId of groups) {
        try {
          // Перед каждым сигналом сверяется live anchor: одного числового PID/group недостаточно.
          const anchors = currentOwned().filter(
            (identity) =>
              identity.groupId === groupId &&
              identity.sessionId === leader.sessionId,
          );
          let unavailable = false;
          const verified = anchors.some((expected) => {
            const current = readIdentity(expected.pid);
            if (current && !sameFixtureProcessIdentity(expected, current))
              unavailable = true;
            return (
              current &&
              sameFixtureProcessIdentity(expected, current) &&
              current.groupId === groupId &&
              current.sessionId === leader.sessionId &&
              isLive(current)
            );
          });
          if (verified) signalGroup(groupId, value);
          else if (unavailable)
            failureReason = "fixture_process_signal_identity_unavailable";
        } catch (error) {
          if (!isGone(error))
            failureReason = "fixture_process_signal_unavailable";
        }
      }
    };
    const wait = async (durationMs: number) => {
      const deadline = Date.now() + durationMs;
      let result = check();
      while (!result.quiescent && Date.now() < deadline) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(pollMs, deadline - Date.now())),
        );
        result = check();
      }
      return result;
    };
    let stopping: Promise<FixtureProcessStopResult> | undefined;
    const stop = () => {
      stopping ??= (async () => {
        signal("SIGTERM");
        let result = await wait(termGraceMs);
        if (!result.quiescent) {
          signal("SIGKILL");
          result = await wait(killWaitMs);
        }
        clearInterval(monitor);
        return result;
      })();
      return stopping;
    };
    return {
      child,
      done,
      stop,
      async confirmQuiescence() {
        // Другие coordinated resources могли держать неоднозначные PID при первом stop.
        // Повторная проверка сохраняет sticky failures и не перезапускает signal phase.
        await stop();
        return wait(confirmWaitMs);
      },
    };
  };
}

/** Запускает Node command в собственной detached Linux session; caller обязательно вызывает stop в finally. */
export const startFixtureProcess = createFixtureProcessStarter();
