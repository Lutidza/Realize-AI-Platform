/**
 * @file .ai/tools/task-workspace/src/filesystem/purgeSnapshot.adapter.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Удаляет карантинное дерево по подтверждённым идентичности и содержимому снимка.
 * @see documentation/specifications/task-management-execution.md
 */
import fs from "node:fs";
import { DIRECTORY, fdPath } from "./WorkspaceFs.adapter.mjs";
import { snapshotTree } from "./snapshotTree.adapter.mjs";
import { fail } from "../Workspace.error.mjs";

/**
 * Удаляет повторно проверенный остаток карантина; подмножество допустимо только в фазе purging журнала.
 * @param {import('./WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {string} relative
 * @param {import('./WorkspaceTree.types.ts').WorkspaceTreeSnapshot} expected
 */
export function purgeSnapshot(storage, relative, expected) {
  const known = new Map(expected.entries.map((e) => [e.path, e]));
  const remaining = snapshotTree(storage, relative);
  for (const entry of remaining.entries) {
    const old = known.get(entry.path);
    if (
      !old ||
      old.dev !== entry.dev ||
      old.ino !== entry.ino ||
      old.kind !== entry.kind ||
      old.mode !== entry.mode ||
      (entry.kind !== "directory" &&
        (old.hash !== entry.hash ||
          old.size !== entry.size ||
          old.mtimeNs !== entry.mtimeNs))
    )
      fail("quarantine_changed");
  }
  storage.withParent(relative, false, (root, parent) => {
    /**
     * @param {string} p
     * @param {string} name
     */
    function remove(p, name) {
      const s = fs.lstatSync(p, { bigint: true });
      const old = known.get(name);
      if (
        !old ||
        old.dev !== String(s.dev) ||
        old.ino !== String(s.ino) ||
        old.mode !== String(s.mode) ||
        (old.kind !== "directory" &&
          (old.size !== String(s.size) || old.mtimeNs !== String(s.mtimeNs)))
      )
        fail("quarantine_changed");
      if (s.isDirectory() && !s.isSymbolicLink()) {
        const fd = fs.openSync(p, DIRECTORY);
        try {
          const opened = fs.fstatSync(fd, { bigint: true });
          if (opened.dev !== s.dev || opened.ino !== s.ino)
            fail("quarantine_changed");
          for (const child of fs.readdirSync(fdPath(fd)).sort())
            remove(`${fdPath(fd)}/${child}`, name ? `${name}/${child}` : child);
        } finally {
          fs.closeSync(fd);
        }
        const current = fs.lstatSync(p, { bigint: true });
        if (current.dev !== s.dev || current.ino !== s.ino)
          fail("quarantine_changed");
        fs.rmdirSync(p);
      } else fs.unlinkSync(p);
    }
    remove(root, "");
    fs.fsyncSync(parent);
  });
}
