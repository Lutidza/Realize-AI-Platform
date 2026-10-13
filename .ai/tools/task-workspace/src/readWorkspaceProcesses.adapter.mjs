/**
 * @file .ai/tools/task-workspace/src/readWorkspaceProcesses.adapter.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Сверяет PID identity и доступные process path references без чтения environment или вывода argv.
 * @see documentation/specifications/task-management-execution.md
 */
import fs from "node:fs";
import { fail } from "./Workspace.error.mjs";
export function processIdentity(pid) {
  try {
    const raw = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const parts = raw
      .slice(raw.lastIndexOf(")") + 2)
      .trim()
      .split(/\s+/);
    return {
      bootId: fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim(),
      startTicks: parts[19],
    };
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "ESRCH") return null;
    fail("process_identity_unavailable");
  }
}
export function sameProcessAlive(pid, identity) {
  if (pid === null) return false;
  const current = processIdentity(pid);
  if (!current) return false;
  if (!identity) fail("producer_identity_required");
  return (
    current.bootId === identity.bootId &&
    current.startTicks === identity.startTicks
  );
}
/** Собственный process исключается; чужие inaccessible entries отражаются как coverage, не как отсутствие процессов. */
export function processReferences(absolute) {
  const references = [];
  let inaccessible = 0;
  const matches = (s) => s === absolute || s.startsWith(absolute + "/");
  for (const id of fs.readdirSync("/proc").filter((n) => /^\d+$/.test(n))) {
    const pid = Number(id);
    if (pid === process.pid) continue;
    try {
      if (fs.statSync(`/proc/${pid}`).uid !== process.getuid()) continue;
      const values = [];
      for (const kind of ["cwd", "exe"]) {
        try {
          values.push(
            fs
              .readlinkSync(`/proc/${pid}/${kind}`)
              .replace(/ \(deleted\)$/, ""),
          );
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
      }
      for (const fd of fs.readdirSync(`/proc/${pid}/fd`)) {
        try {
          values.push(
            fs
              .readlinkSync(`/proc/${pid}/fd/${fd}`)
              .replace(/ \(deleted\)$/, ""),
          );
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
      }
      const argv = fs
        .readFileSync(`/proc/${pid}/cmdline`)
        .toString("utf8")
        .split("\0");
      if (values.some(matches) || argv.some(matches)) references.push(pid);
    } catch (e) {
      if (e.code !== "ENOENT" && e.code !== "ESRCH") inaccessible++;
    }
  }
  return {
    references,
    inaccessible,
    scope:
      "accessible same-UID cwd/exe/fd/pathname argv only; environment not read",
  };
}
