/**
 * @file .ai/tools/task-workspace/src/hashWorkspaceTree.adapter.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Фиксирует bounded дерево артефакта без чтения symlink targets и проверяет неизменность файлов.
 * @see documentation/specifications/task-management-execution.md
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { DIRECTORY, fdPath } from "./WorkspaceFs.adapter.mjs";
import { fail } from "./Workspace.error.mjs";
export const hashBytes = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export const canonicalHash = (value) =>
  hashBytes(Buffer.from(JSON.stringify(value)));
const identity = (s) => ({
  dev: String(s.dev),
  ino: String(s.ino),
  mode: String(s.mode),
  size: String(s.size),
  mtimeNs: String(s.mtimeNs),
});
/** Links становятся leaves с hash link text; их target никогда не открывается. */
export function snapshotTree(storage, relative) {
  const entries = [];
  let bytes = 0;
  let allocatedBytes = 0;
  storage.withParent(relative, false, (root) => {
    function visit(p, name) {
      if (/(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|sqlite|sqlite3|dump)$/.test(name))
        fail("protected_artifact_path");
      const before = fs.lstatSync(p, { bigint: true });
      allocatedBytes += Number(before.blocks) * 512;
      if (entries.length >= 50000) fail("tree_limit");
      if (before.isSymbolicLink()) {
        const text = fs.readlinkSync(p);
        const after = fs.lstatSync(p, { bigint: true });
        if (
          JSON.stringify(identity(before)) !== JSON.stringify(identity(after))
        )
          fail("artifact_changed");
        entries.push({
          path: name,
          kind: "link",
          ...identity(before),
          hash: hashBytes(Buffer.from(text)),
        });
        return;
      }
      if (before.isDirectory()) {
        entries.push({ path: name, kind: "directory", ...identity(before) });
        const fd = fs.openSync(p, DIRECTORY);
        try {
          const opened = fs.fstatSync(fd, { bigint: true });
          if (opened.dev !== before.dev || opened.ino !== before.ino)
            fail("artifact_changed");
          for (const child of fs.readdirSync(fdPath(fd)).sort())
            visit(`${fdPath(fd)}/${child}`, name ? `${name}/${child}` : child);
          if (fs.fstatSync(fd, { bigint: true }).mtimeNs !== before.mtimeNs)
            fail("artifact_changed");
        } finally {
          fs.closeSync(fd);
        }
        return;
      }
      if (!before.isFile()) fail("unsupported_artifact");
      bytes += Number(before.size);
      if (bytes > 2 ** 31 || before.size > BigInt(256 * 1024 * 1024))
        fail("tree_limit");
      const fd = fs.openSync(
        p,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
      );
      let hash;
      try {
        const opened = fs.fstatSync(fd, { bigint: true });
        if (opened.dev !== before.dev || opened.ino !== before.ino)
          fail("artifact_changed");
        const digest = createHash("sha256");
        const buffer = Buffer.alloc(1024 * 1024);
        let n;
        while ((n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0)
          digest.update(buffer.subarray(0, n));
        const after = fs.fstatSync(fd, { bigint: true });
        if (
          JSON.stringify(identity(before)) !== JSON.stringify(identity(after))
        )
          fail("artifact_changed");
        hash = digest.digest("hex");
      } finally {
        fs.closeSync(fd);
      }
      entries.push({ path: name, kind: "file", ...identity(before), hash });
    }
    visit(root, "");
  });
  return {
    hash: canonicalHash(
      entries.map(({ path, kind, mode, hash }) => ({ path, kind, mode, hash })),
    ),
    bytes,
    allocatedBytes,
    entries,
  };
}
/** Оставшееся дерево quarantine может быть подмножеством только в journal phase purging. */
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
