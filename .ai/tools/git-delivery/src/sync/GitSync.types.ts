/**
 * @file .ai/tools/git-delivery/src/sync/GitSync.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Определяет отдельное разрешение fetch/pull, ограниченную сеть и безопасный результат синхронизации.
 */

import type { Context, Result } from "../GitDelivery.types.ts";
import type { Git } from "../Git.adapter.ts";
import type { GitFailureCategory } from "../GitFailureCategory.types.ts";
import type {
  GitFetchNetworkSession,
  GitNetworkConnection,
} from "../network/GitNetwork.types.ts";
import type { GitPushTarget } from "../push/GitPush.types.ts";

export type GitSyncAction = "fetch" | "pull";
export type GitSyncTarget = Omit<GitPushTarget, "remoteOid"> & {
  remoteOid: string;
};

/** Назначение приходит от вызывающей среды; модель не выбирает URL, ветку, OID или режим merge. */
export type GitSyncContext = Pick<
  Context,
  "version" | "requestId" | "projectId" | "taskId" | "repositoryRoot"
> & {
  authorization: {
    actions: [GitSyncAction];
    scope: { mode: "repository" };
  };
  target: GitSyncTarget;
};

export type GitSyncStage =
  | "context"
  | "source"
  | "journal"
  | "connection"
  | "remote"
  | "fetch"
  | "confirm"
  | "apply"
  | "cleanup";

/** Сырой stderr, данные подключения и сообщения исключений не пересекают эту границу. */
export type GitSyncDiagnostic = {
  stage: GitSyncStage;
  category: GitFailureCategory;
  exitCode: number | null;
};

export type GitSyncResult = Omit<Result, "action"> & {
  action: GitSyncAction;
  fetchedCommit: string | null;
  trackingRef: string | null;
  syncStatus: "not_attempted" | "succeeded" | "unknown";
  diagnostic?: GitSyncDiagnostic;
};

export type GitSyncJournal = {
  version: 1;
  kind: GitSyncAction;
  binding: string;
  trackingRef: string;
  previousOid: string | null;
  phase:
    "prepared" | "fetching" | "fetched" | "applying" | "succeeded" | "unknown";
};

/** Исполнитель сети разрешает только primary integration и конкретный немодельный snapshot. */
export type GitSyncDependencies = {
  resolveConnection(): Promise<
    GitNetworkConnection | { state: "absent" | "disabled" }
  >;
  createNetwork(
    git: Git,
    connection: GitNetworkConnection,
    target: GitSyncTarget,
  ): Promise<GitFetchNetworkSession>;
};

export type GitSyncResources = {
  dependencies: GitSyncDependencies;
  close(): Promise<void>;
};
