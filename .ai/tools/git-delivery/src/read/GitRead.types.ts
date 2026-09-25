/**
 * @file .ai/tools/git-delivery/src/read/GitRead.types.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Описывает закрытый снимок и публичные идентичности серверного Git read port.
 */
import type { RepositoryQueryContext } from "../../../../../services/ai-control-plane/src/RepositoryQueries.types";
export type GitReadContext = RepositoryQueryContext;
export type GitReadEntry = {
  path: string;
  mode: string;
  oid: string;
  stage: number;
};
export type GitReadFile = {
  path: string;
  head: GitReadEntry | null;
  index: GitReadEntry | null;
  working: { bytes: Buffer; sha256: string; oid: string; mode: string } | null;
  conflicted: boolean;
  binary: boolean;
};
export type GitReadSnapshot = {
  branch: string | null;
  head: string | null;
  detached: boolean;
  unborn: boolean;
  files: GitReadFile[];
  snapshotHash: string;
  metadataHash: string;
};
export type GitContentIdentity =
  | { source: "head" | "index"; blobOID: string; sha256: string }
  | { source: "working_tree"; sha256: string; byteLength: number }
  | { source: "absent" }
  | { source: "unavailable"; reason: "binary" | "untracked" | "unmerged" };
export type GitReadDiffFile = {
  path: string;
  before: GitContentIdentity;
  after: GitContentIdentity;
  patch: string;
  status:
    "modified" | "added" | "deleted" | "unmerged" | "binary" | "untracked";
  omittedReason: "binary" | "untracked" | "unmerged" | null;
};
