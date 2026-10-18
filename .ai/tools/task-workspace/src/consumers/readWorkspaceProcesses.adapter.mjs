/**
 * @file .ai/tools/task-workspace/src/consumers/readWorkspaceProcesses.adapter.mjs
 * @version 1.0.2
 * @date 2026-10-16
 * @description Сверяет идентичность процесса и доступные ссылки на пути без чтения окружения или вывода argv.
 * @see documentation/specifications/task-management-execution.md
 */
import fs from "node:fs";
import { fail } from "../Workspace.error.mjs";

/**
 * Различает повторное использование PID по загрузке ядра и времени запуска процесса.
 * @param {number} pid
 * @returns {import('@realize/payload-task-manager/workspace-contracts').WorkspaceArtifactProducerIdentity | null}
 */
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
    const code = /** @type {NodeJS.ErrnoException} */ (e).code;
    if (code === "ENOENT" || code === "ESRCH") return null;
    fail("process_identity_unavailable");
  }
}
/**
 * Подтверждает живой процесс только при совпадении сохранённой идентичности.
 * @param {number | null} pid
 * @param {import('@realize/payload-task-manager/workspace-contracts').WorkspaceArtifactProducerIdentity | null | undefined} identity
 * @returns {boolean}
 */
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
/**
 * Исключает текущий процесс и сообщает число недоступных записей как ограничение покрытия.
 * @param {string} absolute
 * @returns {import('./WorkspaceProcess.types.ts').WorkspaceProcessReferences}
 */
export function readWorkspaceProcesses(absolute) {
  const references = [];
  let inaccessible = 0;
  /** @param {string} value */
  const matches = (value) =>
    value === absolute || value.startsWith(absolute + "/");
  for (const id of fs.readdirSync("/proc").filter((n) => /^\d+$/.test(n))) {
    const pid = Number(id);
    if (pid === process.pid) continue;
    try {
      if (
        fs.statSync(`/proc/${pid}`).uid !==
        /** @type {() => number} */ (process.getuid)()
      )
        continue;
      const values = [];
      for (const kind of ["cwd", "exe"]) {
        try {
          values.push(
            fs
              .readlinkSync(`/proc/${pid}/${kind}`)
              .replace(/ \(deleted\)$/, ""),
          );
        } catch (e) {
          if (/** @type {NodeJS.ErrnoException} */ (e).code !== "ENOENT")
            throw e;
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
          if (/** @type {NodeJS.ErrnoException} */ (e).code !== "ENOENT")
            throw e;
        }
      }
      const argv = fs
        .readFileSync(`/proc/${pid}/cmdline`)
        .toString("utf8")
        .split("\0");
      if (values.some(matches) || argv.some(matches)) references.push(pid);
    } catch (e) {
      const code = /** @type {NodeJS.ErrnoException} */ (e).code;
      if (code !== "ENOENT" && code !== "ESRCH") inaccessible++;
    }
  }
  return {
    references,
    inaccessible,
    scope:
      "accessible same-UID cwd/exe/fd/pathname argv only; environment not read",
  };
}
