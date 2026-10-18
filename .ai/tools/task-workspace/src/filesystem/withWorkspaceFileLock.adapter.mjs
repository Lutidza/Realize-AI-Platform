/**
 * @file .ai/tools/task-workspace/src/filesystem/withWorkspaceFileLock.adapter.mjs
 * @version 1.0.2
 * @date 2026-10-15
 * @description Сериализует синхронные файловые операции блокировкой ядра flock.
 * @see documentation/specifications/task-management-execution.md
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { safeTaskKey } from "./safeTaskKey.validator.mjs";
import { fail } from "../Workspace.error.mjs";
import { runtimeRoot } from "../workspacePaths.config.mjs";

/**
 * flock удерживается общим файловым описанием после выхода helper и снимается при close.
 * Файл блокировки сохраняется; callback выполняется синхронно.
 * @template TResult
 * @param {import('./WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {string} key
 * @param {() => TResult} operation
 * @returns {TResult}
 */
export function withWorkspaceFileLock(storage, key, operation) {
  const release = acquireWorkspaceFileLock(storage, key);
  try {
    return operation();
  } finally {
    release();
  }
}

/**
 * Удерживает блокировку до явного release; индекс имеет отдельное имя без коллизии с ключом задачи.
 * @param {import('./WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {string} key
 * @param {'task' | 'recovery-index'} [scope]
 * @returns {() => void}
 */
export function acquireWorkspaceFileLock(storage, key, scope = "task") {
  key = safeTaskKey(key);
  const file =
    scope === "recovery-index"
      ? `${runtimeRoot}/locks/recovery-index.global.lock`
      : `${runtimeRoot}/locks/${key}.lock`;
  return storage.withParent(file, true, (p) => {
    const fd = fs.openSync(
      p,
      fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW,
      0o600,
    );
    try {
      const identity = fs.fstatSync(fd, { bigint: true });
      if (!identity.isFile() || identity.nlink !== 1n) fail("unsafe_lock");
      const lock = spawnSync(
        "/usr/bin/flock",
        ["--exclusive", "--nonblock", "3"],
        {
          stdio: ["ignore", "pipe", "pipe", fd],
          timeout: 10000,
          maxBuffer: 4096,
        },
      );
      if (lock.error) fail("filesystem_capability_required");
      if (lock.status !== 0) fail("workspace_busy");
      const current = fs.lstatSync(p, { bigint: true });
      if (current.dev !== identity.dev || current.ino !== identity.ino)
        fail("lock_identity_changed");
      let released = false;
      return () => {
        if (!released) {
          released = true;
          fs.closeSync(fd);
        }
      };
    } catch (error) {
      fs.closeSync(fd);
      throw error;
    }
  });
}
