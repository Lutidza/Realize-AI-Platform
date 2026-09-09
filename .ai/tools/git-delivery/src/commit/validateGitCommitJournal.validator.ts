/**
 * @file .ai/tools/git-delivery/src/commit/validateGitCommitJournal.validator.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет совместимость и целостность журнала локального commit.
 */
import { createHash } from "node:crypto";
import { PolicyError } from "../Policy.error.ts";
import { relativeFile } from "../contracts.ts";
import type { Journal } from "./GitCommitJournal.types.ts";
import { MAX_GIT_COMMIT_RECOVERY_ATTEMPTS } from "./gitCommitRecovery.constants.ts";

function isHash(value: unknown, length?: number): value is string {
  return (
    typeof value === "string" &&
    (length
      ? new RegExp(`^[a-f0-9]{${length}}$`).test(value)
      : /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value))
  );
}

export function validateGitCommitJournal(value: unknown): Journal {
  const source = value as Journal | null;
  if (
    !source ||
    source.version !== 1 ||
    !isHash(source.binding, 64) ||
    !source.original ||
    !isHash(source.original.head) ||
    typeof source.original.branch !== "string" ||
    !isHash(source.original.fingerprint, 64) ||
    !isHash(source.original.indexHash, 64) ||
    !Array.isArray(source.original.files) ||
    source.original.files.length > 10000 ||
    !Array.isArray(source.original.changes) ||
    source.original.changes.length > 2048 ||
    ![
      source.original.root,
      source.original.gitDir,
      source.original.commonDir,
    ].every((path) => typeof path === "string" && path.startsWith("/")) ||
    !Array.isArray(source.paths) ||
    (!source.paths.length && source.noop !== true) ||
    (source.noop !== undefined &&
      (source.noop !== true ||
        source.paths.length !== 0 ||
        source.commit !== undefined ||
        source.preparedTree !== undefined)) ||
    source.paths.length > 2048 ||
    new Set(source.paths).size !== source.paths.length ||
    (source.preparedTree !== undefined && !isHash(source.preparedTree)) ||
    (source.commit !== undefined && !isHash(source.commit))
  ) {
    throw new PolicyError(
      "invalid_journal",
      "Журнал операции повреждён или несовместим.",
    );
  }
  for (const path of source.paths) relativeFile(path);
  for (const change of source.original.changes) {
    if (!change || typeof change !== "object")
      throw new PolicyError(
        "invalid_journal",
        "Некорректная запись изменения.",
      );
    relativeFile(change.path);
    if (
      typeof change.status !== "string" ||
      !/^[ MADRCU?!T]{2}$/.test(change.status)
    ) {
      throw new PolicyError(
        "invalid_journal",
        "Некорректное состояние пути в журнале.",
      );
    }
  }
  for (const file of source.original.files) {
    if (!file || typeof file !== "object")
      throw new PolicyError("invalid_journal", "Некорректная запись файла.");
    relativeFile(file.path);
    if (
      !["file", "symlink", "missing"].includes(file.kind) ||
      !isHash(file.hash, 64) ||
      ![0, 0o100644, 0o100755, 0o120000].includes(file.mode)
    )
      throw new PolicyError(
        "invalid_journal",
        "Некорректный снимок в журнале.",
      );
  }
  const filePaths = new Set(source.original.files.map((file) => file.path));
  if (
    filePaths.size !== source.original.files.length ||
    source.paths.some((path) => !filePaths.has(path))
  ) {
    throw new PolicyError(
      "invalid_journal",
      "Состав журнала не соответствует снимку.",
    );
  }
  const { root, head, branch, indexHash, files } = source.original;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ root, head, branch, indexHash, files }))
    .digest("hex");
  if (
    fingerprint !== source.original.fingerprint ||
    JSON.stringify(source.paths) !==
      JSON.stringify(source.original.changes.map((change) => change.path))
  ) {
    throw new PolicyError(
      "invalid_journal",
      "Отпечаток или состав журнала изменён.",
    );
  }
  if (source.recovery !== undefined) {
    const recovery = source.recovery;
    if (
      !recovery ||
      typeof recovery !== "object" ||
      Array.isArray(recovery) ||
      Object.keys(recovery).some(
        (key) => !["attempt", "previousFingerprint", "snapshot"].includes(key),
      ) ||
      !Number.isSafeInteger(recovery.attempt) ||
      recovery.attempt < 1 ||
      recovery.attempt > MAX_GIT_COMMIT_RECOVERY_ATTEMPTS ||
      !isHash(recovery.previousFingerprint, 64) ||
      !recovery.snapshot ||
      !Array.isArray(recovery.snapshot.changes) ||
      recovery.snapshot.changes.some(
        (change) => !change || typeof change.path !== "string",
      ) ||
      source.noop
    ) {
      throw new PolicyError(
        "invalid_journal",
        "Некорректное поколение восстановления commit.",
      );
    }
    const recovered = validateGitCommitJournal({
      version: 1,
      binding: source.binding,
      original: recovery.snapshot,
      paths: recovery.snapshot.changes.map((change) => change.path),
    });
    for (const key of [
      "root",
      "gitDir",
      "commonDir",
      "head",
      "branch",
    ] as const) {
      if (recovered.original[key] !== source.original[key]) {
        throw new PolicyError(
          "invalid_journal",
          "Восстановленный снимок подменяет исходное назначение.",
        );
      }
    }
    if (
      recovery.attempt === 1 &&
      recovery.previousFingerprint !== source.original.fingerprint
    ) {
      throw new PolicyError(
        "invalid_journal",
        "Первое восстановление не связано с исходным снимком.",
      );
    }
  }
  return source;
}
