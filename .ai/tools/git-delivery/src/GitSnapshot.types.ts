/**
 * @file .ai/tools/git-delivery/src/GitSnapshot.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Описывает проверенный снимок Git, файлов и входов проверок.
 */
/** Статус porcelain v1 сохраняется вместе с точным именем пути. */
export type Change = { path: string; status: string };

/** Hash включает байты файла или цели symlink; mode отражает Git executable mode. */
export type FileState = {
  path: string;
  kind: "file" | "symlink" | "missing";
  hash: string;
  mode: number;
};

/** Fingerprint связывает Git-состояние, разрешённые изменения и входы проверок. */
export type Snapshot = {
  root: string;
  gitDir: string;
  commonDir: string;
  head: string | null;
  branch: string | null;
  indexHash: string;
  changes: Change[];
  files: FileState[];
  fingerprint: string;
};

/** Проверяет прочитанные байты без сохранения содержимого в снимке. */
export type GitContentValidator = (content: Buffer) => void;

/** Общий остаток допустимого объёма чтения одного снимка. */
export type GitSnapshotReadBudget = { remaining: number };
