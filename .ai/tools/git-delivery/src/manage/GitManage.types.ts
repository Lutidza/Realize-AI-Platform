/**
 * @file .ai/tools/git-delivery/src/manage/GitManage.types.ts
 * @version 1.0.1
 * @date 2026-11-27
 * @description Определяет доверенный контекст и безопасный результат локального управления Git.
 */
import type { Result } from "../GitDelivery.types.ts";

export type StageFile = { kind: "stage-file"; path: string; sha256: string };

export type GitManageOperation =
  | StageFile
  | { kind: "remote-inspect"; remote: string }
  | { kind: "remote-set-url"; remote: string; expectedURL: string; url: string }
  | { kind: "worktree-list" }
  | { kind: "worktree-repair"; paths: string[] }
  | { kind: "branches-list" }
  | { kind: "branch-create"; name: string; switch: boolean }
  | { kind: "branch-switch"; name: string }
  | { kind: "log"; limit: number }
  | {
      kind: "diff";
      scope: "index" | "working-tree";
      paths: string[];
      contextLines: number;
      limitBytes: number;
    };

/** Модель не выбирает operation; caller разрешает ровно один контекст, привязанный к HEAD. */
export type GitManageContext = {
  version: 1;
  requestId: string;
  projectId: string;
  taskId: string;
  repositoryRoot: string;
  authorization: {
    actions: ["manage"];
    scope: { mode: "repository" };
    externalWorktrees?: string[];
  };
  operation: GitManageOperation;
  expected?: { head: string; branch: string | null };
};

/** Данные проходят ограничение размера и проверку явных секретов до выдачи. */
export type GitManageDetails =
  | (StageFile & { blobOid: string; otherEntriesSha256: string })
  | {
      kind: "remote-inspect" | "remote-set-url";
      remote: string;
      urls: string[];
      pushURLs: string[];
    }
  | {
      kind: "worktree-list";
      worktrees: { path: string; head: string | null; branch: string | null }[];
    }
  | { kind: "worktree-repair"; paths: string[] }
  | { kind: "branches-list"; branches: { name: string; head: string }[] }
  | { kind: "branch-create" | "branch-switch"; name: string; head: string }
  | { kind: "log"; commits: { head: string; subject: string }[] }
  | { kind: "diff"; scope: "index" | "working-tree"; patch: string };

export type GitManageResult = Omit<Result, "action"> & {
  action: "manage";
  details?: GitManageDetails;
};

export type GitManageState = {
  head: string;
  branch: string | null;
  target: string[];
};

export type GitManageDiffEntry = { oid: string; mode: string };
export type GitManageWorkingContent = { bytes: Buffer; mode: string };

/** Подготовленный журнал допускает recovery только при точном совпадении before либо after. */
export type GitManageJournal = {
  version: 1;
  kind: "manage";
  binding: string;
  phase: "prepared" | "completed";
  before: GitManageState;
  after: GitManageState;
};
