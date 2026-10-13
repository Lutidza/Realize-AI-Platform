/**
 * @file .ai/tools/task-workspace/src/workspaceProducerDirectories.adapter.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Создаёт producer-каталоги без overwrite и откатывает только собственные пустые директории по inode.
 * @see documentation/specifications/task-management-execution.md
 */
import fs from "node:fs";
import { safeRelative } from "./WorkspaceFs.adapter.mjs";
import { fail } from "./Workspace.error.mjs";

/** Parents остаются закреплёнными через WorkspaceFs; последняя директория всегда создаётся эксклюзивно. */
export function createProducerDirectories(storage, base, paths, created) {
  for (const relative of paths) {
    const parts = safeRelative(relative).split("/");
    let directory = base;
    for (const [index, part] of parts.entries()) {
      directory += "/" + part;
      storage.withParent(directory, false, (file, parent) => {
        try {
          fs.mkdirSync(file, { mode: 0o700 });
          const identity = fs.lstatSync(file, { bigint: true });
          created.push({
            path: directory,
            dev: identity.dev,
            ino: identity.ino,
          });
          fs.fsyncSync(parent);
        } catch (error) {
          if (error.code !== "EEXIST") throw error;
          if (index === parts.length - 1) fail("producer_path_exists");
          const identity = fs.lstatSync(file, { bigint: true });
          if (!identity.isDirectory() || identity.isSymbolicLink())
            fail("symlink_parent");
        }
      });
    }
  }
}

/** rmdir не удаляет содержимое: подмена inode или появление writer сохраняет каталог для владельца. */
export function rollbackProducerDirectories(storage, created) {
  const result = { removed: [], preserved: [] };
  for (const entry of [...created].reverse()) {
    try {
      storage.withParent(entry.path, false, (file, parent) => {
        const actual = fs.lstatSync(file, { bigint: true });
        if (
          !actual.isDirectory() ||
          actual.isSymbolicLink() ||
          actual.dev !== entry.dev ||
          actual.ino !== entry.ino
        )
          fail("directory_identity_changed");
        fs.rmdirSync(file);
        fs.fsyncSync(parent);
        result.removed.push(entry.path);
      });
    } catch (error) {
      if (error.code === "ENOENT") continue;
      result.preserved.push({
        path: entry.path,
        reason: error.code ?? "io_error",
      });
    }
  }
  return result;
}
