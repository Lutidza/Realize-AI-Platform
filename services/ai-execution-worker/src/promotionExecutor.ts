/**
 * @file services/ai-execution-worker/src/promotionExecutor.ts
 * @version 1.0.1
 * @date 2026-09-17
 * @description Проверяет принятый diff, выполняет независимый Codex review и запускает local preview.
 */

import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { CodexConnectionResolver } from "@realize/payload-ai-control/server/integration-runtime";

import { runExecutionCheck } from "./checkRunner";
import type { ExecutionWorkerConfig } from "./config";
import {
  IndependentReviewError,
  runIndependentReview,
} from "./independentReviewer";
import { dropPreviewDatabase } from "./previewDatabase";
import { runPreviewBrowserSmoke } from "./previewBrowserSmoke";
import { runPreviewBrowserPreflight } from "./previewBrowserPreflight.service";
import { resolvePreviewTargetPath } from "./previewTarget.util";
import type { PromotionRepository } from "./promotionRepository";
import {
  commitPromotion,
  preparePromotionWorktree,
  removePromotionWorktree,
} from "./promotionWorktree";
import {
  removePreviewRuntimeFiles,
  startLocalPreview,
  stopLocalPreviewProcess,
} from "./previewRuntime";
import type {
  ClaimedPreviewDeployment,
  LocalPreviewRuntime,
} from "./previewTypes";
import type { WorkerCheckResult } from "./types";
import { WorktreePolicyError } from "./worktree";
import { withWorkspaceDependencies } from "./workspaceDependencies";

class PromotionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromotionValidationError";
  }
}

const sanitizeSummary = (value: string, roots: string[]): string => {
  let result = value;
  for (const root of roots) result = result.replaceAll(root, "[workspace]");
  return result
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, "[redacted-token]")
    .slice(0, 4_000);
};

const cleanupStartedRuntime = async (input: {
  config: ExecutionWorkerConfig;
  job: ClaimedPreviewDeployment;
  runtime: LocalPreviewRuntime;
  workspace: string;
}): Promise<void> => {
  await stopLocalPreviewProcess(input.runtime.processID, input.workspace);
  await dropPreviewDatabase(
    input.config.databaseURL,
    input.runtime.databaseName,
  );
  await removePreviewRuntimeFiles({
    config: input.config,
    workspaceID: input.job.workspaceID,
  });
};

/** Promotes one claimed accepted diff and persists every terminal transition. */
export const executeClaimedPromotion = async (input: {
  config: ExecutionWorkerConfig;
  codex: CodexConnectionResolver;
  job: ClaimedPreviewDeployment;
  repository: PromotionRepository;
}): Promise<void> => {
  let runtime: LocalPreviewRuntime | undefined;
  let workspace = "";
  try {
    const targetPath = resolvePreviewTargetPath(input.job);
    const preflight = await runPreviewBrowserPreflight();
    const checks: WorkerCheckResult[] = [preflight];
    await input.repository.addCheckResult(
      input.job,
      preflight,
      1,
      "preview_validation",
    );
    if (preflight.status === "failed") {
      throw new PromotionValidationError(
        `Preview Chromium preflight failed: ${preflight.outputSummary || "browser unavailable"}`,
      );
    }
    workspace = await preparePromotionWorktree({
      job: input.job,
      repositoryRoot: input.config.repositoryRoot,
      workspaceRoot: input.config.promotionWorkspaceRoot,
    });
    await input.repository.markRunningChecks(input.job);
    await withWorkspaceDependencies(
      input.config.repositoryRoot,
      workspace,
      async () => {
        for (const [index, command] of input.job.requiredChecks.entries()) {
          const result = await runExecutionCheck({
            command,
            repositoryRoot: input.config.repositoryRoot,
            workspace,
          });
          checks.push(result);
          await input.repository.addCheckResult(
            input.job,
            result,
            index + 2,
            "preview_validation",
          );
          if (result.status === "failed") {
            throw new PromotionValidationError(
              `Required check failed: ${command}`,
            );
          }
        }
      },
    );

    await input.repository.markReviewing(input.job);
    const review = await runIndependentReview({
      config: input.config,
      codex: input.codex,
      job: input.job,
      workspace,
    });
    await input.repository.recordReview(input.job, review);
    if (review.status !== "approved") {
      throw new IndependentReviewError(
        `Independent reviewer requested changes: ${review.summary}`,
      );
    }

    await input.repository.markCommitting(input.job);
    const commit = await commitPromotion({ job: input.job, workspace });
    await input.repository.markStartingPreview(input.job, commit);
    runtime = await startLocalPreview({
      commit,
      config: input.config,
      job: input.job,
      targetPath,
      workspace,
    });

    const smoke = await runPreviewBrowserSmoke(runtime.previewURL);
    checks.push(smoke);
    await input.repository.addCheckResult(
      input.job,
      smoke,
      checks.length,
      "preview_smoke",
    );
    if (smoke.status === "failed") {
      throw new PromotionValidationError("Preview Playwright smoke failed.");
    }

    const evidenceHash = createHash("sha256")
      .update(
        JSON.stringify([
          input.job.sourceDiffHash,
          input.job.sourceEvidenceHash,
          review.evidenceHash,
          commit.artifactHash,
          ...checks.map((result) => [
            result.command,
            result.status,
            result.evidenceHash,
          ]),
        ]),
      )
      .digest("hex");
    await input.repository.complete(input.job, {
      commit,
      evidenceHash,
      runtime,
    });
  } catch (error) {
    let cleanupPending = false;
    if (runtime) {
      try {
        await cleanupStartedRuntime({
          config: input.config,
          job: input.job,
          runtime,
          workspace,
        });
      } catch (cleanupError) {
        cleanupPending = true;
        console.error(
          `[ai-execution-worker] preview runtime cleanup failed: ${sanitizeSummary(
            cleanupError instanceof Error
              ? cleanupError.message
              : "unknown cleanup error",
            [input.config.repositoryRoot, workspace],
          )}`,
        );
      }
    }
    if (workspace && !cleanupPending) {
      try {
        await removePromotionWorktree({
          branch: input.job.branch,
          repositoryRoot: input.config.repositoryRoot,
          workspaceID: input.job.workspaceID,
          workspaceRoot: input.config.promotionWorkspaceRoot,
        });
      } catch (cleanupError) {
        cleanupPending = true;
        console.error(
          `[ai-execution-worker] promotion worktree cleanup failed: ${sanitizeSummary(
            cleanupError instanceof Error
              ? cleanupError.message
              : "unknown cleanup error",
            [input.config.repositoryRoot, workspace],
          )}`,
        );
      }
    }
    const summary = sanitizeSummary(
      error instanceof Error ? error.message : "Preview promotion failed.",
      [input.config.repositoryRoot, workspace].filter(Boolean),
    );
    await input.repository.fail(input.job, {
      blocked:
        error instanceof WorktreePolicyError ||
        error instanceof IndependentReviewError,
      cleanupPending,
      ...(cleanupPending && runtime ? { runtime } : {}),
      summary,
    });
  }
};

/** Cleans rejected or expired preview runtimes using only persisted handles. */
export const cleanupPreviewRuntimes = async (input: {
  config: ExecutionWorkerConfig;
  repository: PromotionRepository;
}): Promise<void> => {
  for (const target of await input.repository.listCleanupTargets()) {
    const workspace = resolve(
      input.config.promotionWorkspaceRoot,
      target.workspaceID,
    );
    try {
      await stopLocalPreviewProcess(target.processID, workspace);
      if (target.databaseName) {
        await dropPreviewDatabase(
          input.config.databaseURL,
          target.databaseName,
        );
      }
      await removePreviewRuntimeFiles({
        config: input.config,
        workspaceID: target.workspaceID,
      });
      await removePromotionWorktree({
        branch: target.branch,
        repositoryRoot: input.config.repositoryRoot,
        workspaceID: target.workspaceID,
        workspaceRoot: input.config.promotionWorkspaceRoot,
      });
      await input.repository.markRuntimeStopped(target);
    } catch (error) {
      console.error(
        `[ai-execution-worker] stale preview cleanup failed deployment=${target.id}: ${sanitizeSummary(
          error instanceof Error ? error.message : "unknown cleanup error",
          [input.config.repositoryRoot, workspace],
        )}`,
      );
    }
  }
};
