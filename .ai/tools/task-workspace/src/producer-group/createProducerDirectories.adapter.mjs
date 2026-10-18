/**
 * @file .ai/tools/task-workspace/src/producer-group/createProducerDirectories.adapter.mjs
 * @version 1.0.2
 * @date 2026-10-15
 * @description Планирует и создаёт producer-каталоги с долговечной идентичностью для безопасного продолжения begin.
 * @see documentation/specifications/task-management-execution.md
 */
import fs from "node:fs";
import { safeRelative } from "../filesystem/safeRelative.validator.mjs";
import { fail } from "../Workspace.error.mjs";
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import { snapshotTree } from "../filesystem/snapshotTree.adapter.mjs";

/**
 * Проверяет существующих родителей и фиксирует отсутствие новых каталогов до prepared.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {string} base
 * @param {readonly string[]} paths
 * @returns {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerDirectoryPlan[]}
 */
export function planProducerDirectories(storage, base, paths) {
  /** @type {Map<string, import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerDirectoryPlan>} */
  const entries = new Map();
  for (const relative of paths) {
    const parts = safeRelative(relative).split("/");
    let directory = base;
    for (const [index, part] of parts.entries()) {
      directory += "/" + part;
      if (entries.has(directory)) continue;
      const identity = readDirectoryIdentity(storage, directory);
      if (identity && index === parts.length - 1) fail("producer_path_exists");
      entries.set(directory, {
        path: directory,
        state: identity ? "existing" : "pending",
        identity,
      });
    }
  }
  return [...entries.values()];
}

/** Пустой каталог имеет заранее известный content hash; inode закрепляется после mkdir. */
export function emptyProducerDirectorySnapshot() {
  const mode = String(fs.constants.S_IFDIR | (0o700 & ~process.umask()));
  return {
    hash: canonicalHash([{ path: "", kind: "directory", mode }]),
    bytes: 0,
  };
}

/**
 * Каждый созданный inode сохраняется до перехода к следующему каталогу. Существующий
 * pending-путь после прерывания нельзя признать собственным без сохранённой идентичности.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerDirectoryPlan[]} directories
 * @param {() => void} save
 */
export function createProducerDirectories(storage, directories, save) {
  for (const directory of directories) {
    const current = readDirectoryIdentity(storage, directory.path);
    if (directory.state !== "pending") {
      if (!sameDirectory(current, directory.identity))
        fail("directory_identity_changed");
      continue;
    }
    if (current) fail("producer_directory_outcome_unknown");
    storage.withParent(directory.path, false, (file, parent) => {
      fs.mkdirSync(file, { mode: 0o700 });
      const identity = fs.lstatSync(file, { bigint: true });
      fs.fsyncSync(parent);
      directory.identity = {
        dev: String(identity.dev),
        ino: String(identity.ino),
      };
      directory.state = "created";
      save();
    });
  }
}

/**
 * Перед регистрацией проверяются те же inode и пустые корни, которые обещаны журналом.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {string} base
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerDirectoryPlan[]} directories
 * @param {import("@realize/payload-task-manager/workspace-contracts").WorkspaceArtifact[]} artifacts
 */
export function assertEmptyProducerDirectories(
  storage,
  base,
  directories,
  artifacts,
) {
  for (const directory of directories) {
    if (
      !sameDirectory(
        readDirectoryIdentity(storage, directory.path),
        directory.identity,
      )
    )
      fail("directory_identity_changed");
  }
  for (const artifact of artifacts) {
    const snapshot = snapshotTree(storage, `${base}/${artifact.path}`);
    if (
      snapshot.entries.length !== 1 ||
      snapshot.entries[0].kind !== "directory" ||
      snapshot.bytes !== artifact.bytes ||
      snapshot.hash !== artifact.hash
    )
      fail("producer_directory_changed");
  }
}

/**
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {string} relative
 * @returns {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerDirectoryIdentity | null}
 */
function readDirectoryIdentity(storage, relative) {
  try {
    return storage.withParent(relative, false, (file) => {
      const stat = fs.lstatSync(file, { bigint: true });
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail("symlink_parent");
      return { dev: String(stat.dev), ino: String(stat.ino) };
    });
  } catch (caught) {
    if (/** @type {NodeJS.ErrnoException} */ (caught).code === "ENOENT")
      return null;
    throw caught;
  }
}

/**
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerDirectoryIdentity | null} current
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerDirectoryIdentity | null} expected
 */
function sameDirectory(current, expected) {
  return (
    current !== null &&
    expected !== null &&
    current.dev === expected.dev &&
    current.ino === expected.ino
  );
}
