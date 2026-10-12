/**
 * @file .ai/tools/git-delivery/src/merge/GitMerge.types.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Определяет назначенное approved-tree слияние GitHub и закрытые зависимости исполнителя.
 * @see documentation/architecture/decisions/ADR-0016-development-git-delivery-handler.md
 */
import type {
  Context,
  Identity,
  CheckResult,
  Result,
} from "../GitDelivery.types.ts";
import type { RuntimeGitHubIntegration } from "@realize/payload-ai-control/server/integration-runtime";
import type { GitJournalRepository } from "../GitJournal.repository.ts";

/** Модель не назначает refs, tree, область, авторство или результаты проверок. */
export type GitMergeContext = Pick<
  Context,
  "version" | "requestId" | "projectId" | "taskId" | "repositoryRoot"
> & {
  candidateSourceRoot: string;
  authorization: { actions: ["merge"]; scope: { mode: "approved-tree" } };
  target: {
    connectionKey: "github:primary";
    connectionRevision: number;
    repositorySlug: string;
    repositoryID: number;
    ref: string;
    oid: string;
    treeOid: string;
  };
  source: { ref: string; oid: string };
  candidate: {
    treeOid: string;
    approvedChangedPaths: string[];
    files: GitMergeCandidateFile[];
  };
  identity: Identity;
  message: string;
  verification: { requiredChecks: string[]; results: CheckResult[] };
};
export type GitMergeCandidateFile = {
  path: string;
  mode: "100644" | "100755" | null;
  blobOid: string | null;
};
export type GitMergeCandidateBytes = GitMergeCandidateFile & {
  bytes: Buffer | null;
};
export type GitTreeHashNode = {
  children: Map<string, GitTreeHashNode>;
  mode?: string;
  sha?: string;
};

export type GitMergeTree = {
  sha: string;
  truncated: boolean;
  tree: { path: string; mode: string; type: string; sha: string }[];
};
export type GitMergeCommitBody = {
  message: string;
  tree: string;
  parents: [string, string];
  author: Identity & { date: string };
  committer: Identity & { date: string };
};
export type GitMergeCommit = {
  sha: string;
  treeOid: string;
  parents: string[];
  message: string;
  author: Identity & { date: string };
  committer: Identity & { date: string };
};

/** Только фиксированные endpoints одного репозитория; сырые HTTP данные наружу не выдаются. */
export type GitMergeRemote = {
  readRepository(): Promise<{ id: number; fullName: string }>;
  readRef(ref: string): Promise<string>;
  readCommit(oid: string): Promise<GitMergeCommit | null>;
  readTree(oid: string): Promise<GitMergeTree | null>;
  hasBlob(oid: string): Promise<boolean>;
  createBlob(bytes: Buffer): Promise<string>;
  createTree(
    baseTree: string,
    entries: GitMergeCandidateFile[],
  ): Promise<string>;
  createCommit(body: GitMergeCommitBody): Promise<GitMergeCommit>;
  updateRef(ref: string, oid: string): Promise<string>;
};
export type GitMergeDependencies = {
  resolveConnection(): Promise<RuntimeGitHubIntegration>;
  createRemote(
    connection: Extract<RuntimeGitHubIntegration, { state: "ready" }>,
  ): GitMergeRemote;
};
export type GitMergeResources = {
  dependencies: GitMergeDependencies;
  close(): Promise<void>;
};
export type GitMergeLocalSource = {
  storage: GitJournalRepository;
  assertHeld(): void;
  assertReady(): Promise<void>;
  close(): Promise<void>;
};
export type GitMergeJournal = {
  version: 1;
  kind: "merge";
  binding: string;
  phase:
    | "prepared"
    | "uploading"
    | "uploaded"
    | "creating"
    | "created"
    | "updating"
    | "completed"
    | "unknown";
  body: GitMergeCommitBody;
  expectedCommit: string;
  uncertainStage?: "uploading" | "creating" | "updating";
  uploadedBlobs: string[];
  pendingObject?: { kind: "blob" | "tree"; oid: string };
};
/** Отчёт исключает credential, raw blobs, HTTP bodies и сообщения исключений провайдера. */
export type GitMergeResult = Omit<Result, "action"> & {
  action: "merge";
  mergedTree: string | null;
  remoteCommit: string | null;
  mergeStatus: "not_attempted" | "succeeded" | "unknown";
};
