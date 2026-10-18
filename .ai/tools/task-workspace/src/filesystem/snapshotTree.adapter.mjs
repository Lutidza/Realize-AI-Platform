/**
 * @file .ai/tools/task-workspace/src/filesystem/snapshotTree.adapter.mjs
 * @version 1.0.1
 * @date 2026-10-15
 * @description Читает ограниченный снимок дерева без следования ссылкам и проверяет неизменность файлов.
 * @see documentation/specifications/task-management-execution.md
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { DIRECTORY, fdPath } from "./WorkspaceFs.adapter.mjs";
import { canonicalHash, hashBytes } from "./canonicalHash.util.mjs";
import { fail } from "../Workspace.error.mjs";

/**
 * @param {import('node:fs').BigIntStats} s
 * @returns {import('./WorkspaceTree.types.ts').WorkspaceTreeIdentity}
 */
const identity = (s) => ({
  dev: String(s.dev),
  ino: String(s.ino),
  mode: String(s.mode),
  size: String(s.size),
  mtimeNs: String(s.mtimeNs),
});
/**
 * Ссылки остаются листьями с хешем текста ссылки; их целевой путь не открывается.
 * @param {import('./WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {string} relative
 * @returns {import('./WorkspaceTree.types.ts').WorkspaceTreeSnapshot}
 */
export function snapshotTree(storage, relative) {
  /** @type {import('./WorkspaceTree.types.ts').WorkspaceTreeEntry[]} */
  const entries = [];
  let bytes = 0;
  let allocatedBytes = 0;
  storage.withParent(relative, false, (root) => {
    /**
     * @param {string} p
     * @param {string} name
     */
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
