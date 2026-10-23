/**
 * @file .ai/tools/git-delivery/src/worker/GitWorker.types.ts
 * @version 2.0.0
 * @date 2026-10-23
 * @description Определяет контракты Git-воркеров, транспорта и подтверждённого отчёта.
 */

import type { GitCommitAuthor } from "@realize/ai-contracts";
import type { Context, Result } from "../contracts.ts";
import type { GitPushContext, GitPushResult } from "../push/GitPush.types.ts";
import type {
  GitManageContext,
  GitManageResult,
} from "../manage/GitManage.types.ts";
import type { GitSyncContext, GitSyncResult } from "../sync/GitSync.types.ts";
import type { GIT_WORKER_ACTIONS } from "./gitWorkerActions.constants.ts";
import type {
  GitMergeContext,
  GitMergeResult,
} from "../merge/GitMerge.types.ts";
import type { GitVerificationWorkerContext } from "./verification/GitWorkerVerification.types.ts";

export type GitWorkerAction = (typeof GIT_WORKER_ACTIONS)[number];
export type GitWorkerCommand = { action: GitWorkerAction; message?: string };
export type GitWorkerContext =
  | Context
  | GitPushContext
  | GitManageContext
  | GitSyncContext
  | GitMergeContext;
export type GitWorkerResult =
  Result | GitPushResult | GitManageResult | GitSyncResult | GitMergeResult;

export type GitWorkerSettings = {
  model: string;
  reasoningEffort: "low" | "medium" | "high";
  timeoutMs: number;
  instructions: string;
};

export type GitInspectContext = Omit<Context, "authorization" | "identity"> & {
  authorization: {
    actions: ["inspect"];
    scope: Context["authorization"]["scope"];
  };
};

export type GitWorkerTransport = {
  start(): void;
  request<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T>;
  notify(method: string, params?: Record<string, unknown>): void;
  getNotifications(): AsyncIterable<{
    method?: string;
    params?: Record<string, unknown>;
  }>;
  close(): Promise<void>;
};

export type GitWorkerDependencies = {
  createTransport: (options: {
    signal: AbortSignal;
    onRequest: (method: string, params: unknown) => Promise<unknown>;
  }) => GitWorkerTransport;
  deliver: (
    command: GitWorkerCommand,
    context: GitWorkerContext,
  ) => Promise<GitWorkerResult>;
};

export type GitWorkerReport = {
  version: 1;
  status: "succeeded" | "blocked" | "failed";
  errorCode: string | null;
  result: GitWorkerResult | null;
  command: GitWorkerCommand | null;
  worker: {
    /** null для программного inspect; usage содержит нули, сессия модели отсутствует. */
    model: string | null;
    threadId: string | null;
    turnId: string | null;
    durationMs: number;
    handlerCalls: number;
    instructionBytes: number;
    usage: {
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
    } | null;
  };
};

/** Доверенные зависимости загрузчика не изменяют authorization и не доступны модели. */
export type GitWorkerContextLoaderDependencies = {
  resolveCommitAuthor?(repositoryRoot: string): Promise<GitCommitAuthor>;
  prepareVerification?(
    context: GitVerificationWorkerContext,
  ): Promise<GitVerificationWorkerContext>;
};
