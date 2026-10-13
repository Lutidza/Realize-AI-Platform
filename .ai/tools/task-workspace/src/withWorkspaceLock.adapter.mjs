/**
 * @file .ai/tools/task-workspace/src/withWorkspaceLock.adapter.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Сериализует mutations kernel flock без stale PID locks и фонового lock worker.
 * @see documentation/specifications/task-management-execution.md
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { safeTaskKey } from "./WorkspaceFs.adapter.mjs";
import { fail } from "./Workspace.error.mjs";
export const runtimeRoot = ".ai/tools/task-workspace/runtime";
/** flock сохраняется на общей open file description после exit helper; close в parent освобождает его при любом исходе. Lock file не удаляется. */
export function withWorkspaceLock(storage, key, operation) {
  key = safeTaskKey(key);
  const file = `${runtimeRoot}/locks/${key}.lock`;
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
      return operation();
    } finally {
      fs.closeSync(fd);
    }
  });
}
