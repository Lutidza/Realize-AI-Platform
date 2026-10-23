/**
 * @file .ai/tools/git-delivery/src/worker/verification/GitWorkerVerification.types.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Определяет связь доверенного verification plan с Git-контекстом и подтверждённым commit.
 */
import type { Context } from "../../GitDelivery.types.ts";
import type { GitPushContext } from "../../push/GitPush.types.ts";
import type {
  VerificationPlan,
  runVerification,
  verifyVerification,
  enumerateVerificationInputs,
} from "@realize/verification-runtime";
import type { loadGitWorkerSettings } from "../loadGitWorkerSettings.adapter.ts";
import type { runGitWorker } from "../runGitWorker.service.ts";
import type {
  GitWorkerContextLoaderDependencies,
  GitWorkerReport,
} from "../GitWorker.types.ts";

export type GitVerificationWorkerContext = Context | GitPushContext;
export type GitVerifiedCheck = {
  id: string;
  key: string;
  recipeKey: string;
  receiptId: string;
};
export type GitVerificationPreparedProof = {
  version: 1;
  kind: "git-verification-precommit";
  binding: string;
  fingerprint: string;
  checks: GitVerifiedCheck[];
};
export type GitVerificationCommitProof = {
  version: 1;
  kind: "git-verification-commit";
  projectId: string;
  taskId: string;
  repositoryRoot: string;
  commit: string;
  fingerprint: string;
  checks: GitVerifiedCheck[];
};
export type GitWorkerVerificationPreparation = {
  context: GitVerificationWorkerContext;
  plan: VerificationPlan;
  fingerprint?: string;
  checks?: GitVerifiedCheck[];
};
/** Подмены для изолированных тестов; production использует штатные configured worker и core receipts. */
export type GitWorkerVerificationDependencies = {
  runVerification?: typeof runVerification;
  verifyVerification?: typeof verifyVerification;
  enumerateInputs?: typeof enumerateVerificationInputs;
  runWorker?: typeof runGitWorker;
  loadSettings?: typeof loadGitWorkerSettings;
  resolveCommitAuthor?: GitWorkerContextLoaderDependencies["resolveCommitAuthor"];
};
export type GitWorkerVerificationInput = {
  context: GitVerificationWorkerContext;
  planPath: string;
  inspect: (context: Context) => Promise<GitWorkerReport>;
  signal?: AbortSignal;
  dependencies?: GitWorkerVerificationDependencies;
};
