/**
 * @file .ai/tools/git-delivery/src/push/GitPush.types.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Определяет разрешённое назначение push, проверки коммитов и результат сетевой записи.
 */

import type { Context, Result } from "../contracts.ts";
import type { Git } from "../Git.adapter.ts";
import type { GitFailureCategory } from "../GitFailureCategory.types.ts";
import type { GIT_PUSH_STAGES } from "./gitPush.constants.ts";
import type {
  GitNetworkConnection,
  GitNetworkSession,
} from "../network/GitNetwork.types.ts";

export type GitPushTarget = {
  connectionKey: "github:primary";
  connectionRevision: number;
  repositorySlug: string;
  transport: "https" | "ssh";
  branch: string;
  sourceOid: string;
  remoteOid: string | null;
};

export type GitPushStage = (typeof GIT_PUSH_STAGES)[number];

/** Только конечные значения: сообщения процессов и данные подключения сюда не входят. */
export type GitPushDiagnostic = {
  stage: GitPushStage;
  category: GitFailureCategory;
  exitCode: number | null;
};

/** Вызывающая среда отдельно разрешает одну следующую попытку прежней операции. */
export type GitPushRecovery = { attempt: number };

/** Полномочия и результаты проверок поступают от вызывающей среды, отдельно от модели. */
export type GitPushContext = Pick<
  Context,
  "version" | "requestId" | "projectId" | "taskId" | "repositoryRoot"
> & {
  authorization: {
    actions: ["push"];
    scope: { mode: "commits"; commits: string[] };
  };
  target: GitPushTarget;
  verification: {
    requiredChecks: string[];
    results: { id: string; status: "passed" | "failed"; commit: string }[];
  };
  recovery?: GitPushRecovery;
};

export type GitPushResult = Omit<Result, "pushStatus"> & {
  pushStatus: "not_attempted" | "succeeded" | "unknown";
  remoteCommit: string | null;
  diagnostic?: GitPushDiagnostic;
  recoveryAttempts?: number;
};

export type GitPushJournal = {
  version: 1;
  kind: "push";
  binding: string;
  target: GitPushTarget;
  commits: string[];
  phase: "prepared" | "sending" | "succeeded" | "unknown";
  diagnostic?: GitPushDiagnostic;
  recoveryAttempts?: number;
};

export type GitPushDependencies = {
  resolveConnection(): Promise<
    GitNetworkConnection | { state: "absent" | "disabled" }
  >;
  createNetwork(
    git: Git,
    connection: GitNetworkConnection,
    target: GitPushTarget,
  ): Promise<GitNetworkSession>;
};

export type GitPushResources = {
  dependencies: GitPushDependencies;
  close(): Promise<void>;
};
