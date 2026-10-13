/**
 * @file tests/e2e/support/taskManagerAcceptance/FixtureContainmentProof.adapter.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Доказывает ancestry и владение выделенной transient unit через systemd и /proc.
 * @see documentation/specifications/task-management-execution.md
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import {
  readFixtureProcessIdentity,
  sameFixtureProcessIdentity as sameFixtureIdentity,
} from "./FixtureProcess.adapter";
import type { FixtureProcessIdentity } from "./FixtureProcess.types";
import type {
  FixtureContainmentRuntime,
  FixtureContainmentUnit,
} from "./FixtureProcessContainment.types";

/** Отсутствие unified membership или legacy hierarchy не заменяется guessed domain. */
export function readFixtureCgroup(pid: number): string {
  const lines = readFileSync(`/proc/${pid}/cgroup`, "utf8").trim().split("\n");
  if (lines.length !== 1 || !lines[0].startsWith("0::/"))
    throw new Error("FIXTURE_CONTAINMENT_CGROUP_UNAVAILABLE");
  return lines[0].slice(3);
}

/** cgroup.procs покрывает также writers с изменённой UID; Delegate=no не заменяет полный census. */
export function readFixtureCgroupMembers(cgroup: string): number[] {
  const directory = `/sys/fs/cgroup${cgroup}`;
  if (
    readdirSync(directory, { withFileTypes: true }).some((entry) =>
      entry.isDirectory(),
    )
  )
    throw new Error("FIXTURE_CONTAINMENT_NESTED_CGROUP");
  const raw = readFileSync(`${directory}/cgroup.procs`, "utf8").trim();
  if (!raw) return [];
  const entries = raw.split(/\s+/);
  if (
    entries.some(
      (value) =>
        !/^\d+$/.test(value) ||
        !Number.isSafeInteger(Number(value)) ||
        Number(value) < 1,
    )
  )
    throw new Error("FIXTURE_CONTAINMENT_MEMBERS_UNAVAILABLE");
  return [...new Set(entries.map(Number))];
}

export function readFixtureContainmentUnit(
  unit: string,
): FixtureContainmentUnit {
  const output = execFileSync(
    "systemctl",
    [
      "--user",
      "show",
      unit,
      "--no-pager",
      "--property=Id,ControlGroup,MainPID,Transient,Delegate,LoadState",
    ],
    {
      encoding: "utf8",
      timeout: 1000,
      maxBuffer: 16384,
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  const fields = Object.fromEntries(
    output
      .trim()
      .split("\n")
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
  if (
    !["yes", "no"].includes(fields.Transient) ||
    !["yes", "no"].includes(fields.Delegate)
  )
    throw new Error("FIXTURE_CONTAINMENT_UNIT_UNAVAILABLE");
  return {
    id: fields.Id,
    controlGroup: fields.ControlGroup,
    mainPid: Number(fields.MainPID),
    transient: fields.Transient === "yes",
    delegate: fields.Delegate === "yes",
    loaded: fields.LoadState === "loaded",
  };
}

/** Валидирует exact unit и живую цепочку self → MainPID; env сам по себе proof не является. */
export function readFixtureContainmentProof(
  unit: string,
  runtime: FixtureContainmentRuntime,
) {
  if (
    !/^realize-fixture-task-browser-[a-z0-9][a-z0-9-]{0,80}\.service$/.test(
      unit,
    )
  )
    throw new Error("FIXTURE_CONTAINMENT_UNIT_INVALID");
  const pid = runtime.pid ?? process.pid;
  const uid = runtime.uid ?? process.getuid?.();
  if (
    uid === undefined ||
    !Number.isSafeInteger(uid) ||
    !Number.isSafeInteger(pid) ||
    pid < 1
  )
    throw new Error("FIXTURE_CONTAINMENT_IDENTITY_UNAVAILABLE");
  const metadata = (runtime.readUnit ?? readFixtureContainmentUnit)(unit);
  const cgroup = metadata.controlGroup;
  if (
    metadata.id !== unit ||
    !metadata.loaded ||
    !metadata.transient ||
    metadata.delegate ||
    !Number.isSafeInteger(metadata.mainPid) ||
    metadata.mainPid < 1 ||
    !cgroup?.startsWith(`/user.slice/user-${uid}.slice/user@${uid}.service/`) ||
    !cgroup.endsWith(`/${unit}`) ||
    cgroup.includes("//") ||
    cgroup.split("/").some((part) => part === "." || part === "..")
  )
    throw new Error("FIXTURE_CONTAINMENT_UNIT_INVALID");
  const readIdentity = runtime.readIdentity ?? readFixtureProcessIdentity;
  const readCgroup = runtime.readCgroup ?? readFixtureCgroup;
  const readUid =
    runtime.readUid ??
    ((processId: number) => statSync(`/proc/${processId}`).uid);
  const ancestors: FixtureProcessIdentity[] = [];
  const seen = new Set<number>();
  let nextPid = pid;
  while (ancestors.length < 64) {
    if (seen.has(nextPid)) break;
    seen.add(nextPid);
    const identity = readIdentity(nextPid);
    if (
      !identity ||
      identity.pid !== nextPid ||
      ["Z", "X"].includes(identity.state) ||
      readUid(nextPid) !== uid ||
      readCgroup(nextPid) !== cgroup ||
      (ancestors[0] && identity.bootId !== ancestors[0].bootId)
    )
      break;
    const verified = readIdentity(nextPid);
    if (
      !verified ||
      !sameFixtureIdentity(identity, verified) ||
      verified.parentPid !== identity.parentPid
    )
      break;
    ancestors.push({ ...identity });
    if (identity.pid === metadata.mainPid) {
      for (const expected of ancestors) {
        const current = readIdentity(expected.pid);
        if (
          !current ||
          !sameFixtureIdentity(expected, current) ||
          current.parentPid !== expected.parentPid ||
          ["Z", "X"].includes(current.state) ||
          readUid(current.pid) !== uid ||
          readCgroup(current.pid) !== cgroup
        )
          throw new Error("FIXTURE_CONTAINMENT_ANCESTRY_INVALID");
      }
      const fresh = (runtime.readUnit ?? readFixtureContainmentUnit)(unit);
      if (
        fresh.id !== metadata.id ||
        fresh.controlGroup !== cgroup ||
        fresh.mainPid !== metadata.mainPid ||
        !fresh.transient ||
        fresh.delegate ||
        !fresh.loaded
      )
        throw new Error("FIXTURE_CONTAINMENT_UNIT_INVALID");
      return { unit, cgroup, uid, ancestors };
    }
    nextPid = identity.parentPid;
    if (nextPid < 1) break;
  }
  throw new Error("FIXTURE_CONTAINMENT_ANCESTRY_INVALID");
}
