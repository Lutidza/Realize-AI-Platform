/**
 * @file services/ai-execution-worker/src/executor.ts
 * @version 1.0.1
 * @date 2026-09-11
 * @description Выполняет разрешённую реализацию через выбранную интеграцию Codex и проверяет результат.
 */

import { createHash } from "node:crypto";

import type { AgentEvent } from "@realize/ai-contracts";
import {
  buildCodeExecutionDeveloperInstructions,
  verifyExecutionCapability,
} from "@realize/change-engine";
import { OpenAICodexAdapter } from "@realize/codex-adapter";
import type { CodexConnectionResolver } from "@realize/payload-ai-control/server/integration-runtime";

import { runExecutionCheck } from "./checkRunner";
import type { ExecutionWorkerConfig } from "./config";
import { ExecutionJobRepository } from "./jobRepository";
import type { ClaimedExecutionJob, WorkerCheckResult } from "./types";
import { withWorkspaceDependencies } from "./workspaceDependencies";
import {
  captureWorktreeDiff,
  createExecutionWorktree,
  WorktreePolicyError,
} from "./worktree";

class ValidationFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationFailure";
  }
}

const sanitizeSummary = (value: string, roots: string[]): string => {
  let result = value;
  for (const root of roots) result = result.replaceAll(root, "[workspace]");
  return result.slice(0, 4_000);
};

const runAgent = async (input: {
  config: ExecutionWorkerConfig;
  codex: CodexConnectionResolver;
  job: ClaimedExecutionJob;
  workspace: string;
}): Promise<string> => {
  const lease = await input.codex.acquire();
  const adapter = new OpenAICodexAdapter({
    codexBinary: input.config.codexBinary,
    environment: lease.environment,
    signal: lease.signal,
  });
  let finalSummary = "";
  let failure: string | undefined;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void adapter.cancelRun(input.job.executionKey);
  }, input.config.turnTimeoutMs);
  timer.unref();
  try {
    for await (const event of adapter.runTurn({
      cwd: input.workspace,
      developerInstructions: buildCodeExecutionDeveloperInstructions({
        affectedPaths: input.job.allowedPaths,
        baseCommit: input.job.baseCommit,
        changeRequestID: String(input.job.changeRequestID),
        checks: input.job.checks,
      }),
      ephemeral: true,
      model: lease.model,
      prompt: `${input.job.originalRequest}\n\nApproved implementation plan:\n${input.job.plan}`,
      runID: input.job.executionKey,
      sandboxProfile: "code-workspace-write",
    })) {
      const normalized = event as AgentEvent;
      if (normalized.type === "assistant.completed") {
        finalSummary = normalized.content;
      } else if (normalized.type === "run.failed") {
        failure = normalized.message;
      } else if (normalized.type === "run.cancelled" && !timedOut) {
        failure = "Codex implementation turn was cancelled.";
      }
    }
  } finally {
    clearTimeout(timer);
    await lease.dispose();
  }
  if (timedOut) throw new Error("Codex implementation turn timed out.");
  if (failure) throw new Error(failure);
  return finalSummary || "Codex completed the isolated implementation turn.";
};

/** Исполняет уже арендованное задание и сохраняет каждый итоговый переход. */
export const executeClaimedJob = async (input: {
  config: ExecutionWorkerConfig;
  codex: CodexConnectionResolver;
  job: ClaimedExecutionJob;
  repository: ExecutionJobRepository;
}): Promise<void> => {
  let validationPhase = false;
  let workspace = "";
  try {
    if (
      !verifyExecutionCapability({
        claims: input.job.capability,
        expectedTokenHash: input.job.capabilityTokenHash,
        secret: input.config.signingSecret,
      })
    ) {
      throw new WorktreePolicyError(
        "Execution capability is invalid, expired or no longer bound to this job.",
      );
    }
    workspace = await createExecutionWorktree({
      job: input.job,
      repositoryRoot: input.config.repositoryRoot,
      workspaceRoot: input.config.workspaceRoot,
    });
    await input.repository.markRunning(input.job);
    const workerSummary = await runAgent({
      config: input.config,
      codex: input.codex,
      job: input.job,
      workspace,
    });
    const diff = await captureWorktreeDiff(workspace, input.job);

    validationPhase = true;
    await input.repository.markValidating(input.job);
    const checkResults: WorkerCheckResult[] = [];
    await withWorkspaceDependencies(
      input.config.repositoryRoot,
      workspace,
      async () => {
        for (const [index, command] of input.job.checks.entries()) {
          const result = await runExecutionCheck({
            command,
            repositoryRoot: input.config.repositoryRoot,
            workspace,
          });
          checkResults.push(result);
          await input.repository.addCheckResult(input.job, result, index + 1);
          if (result.status === "failed") {
            throw new ValidationFailure(`Required check failed: ${command}`);
          }
        }
      },
    );
    const evidenceHash = createHash("sha256")
      .update(
        JSON.stringify([
          diff.diffHash,
          ...checkResults.map((result) => [
            result.command,
            result.status,
            result.evidenceHash,
          ]),
        ]),
      )
      .digest("hex");
    await input.repository.complete(
      input.job,
      diff,
      evidenceHash,
      sanitizeSummary(workerSummary, [input.config.repositoryRoot, workspace]),
    );
  } catch (error) {
    const summary = sanitizeSummary(
      error instanceof Error ? error.message : "Execution worker failed.",
      [input.config.repositoryRoot, workspace].filter(Boolean),
    );
    await input.repository.fail(input.job, {
      blocked: error instanceof WorktreePolicyError,
      summary,
      validationFailure: validationPhase || error instanceof ValidationFailure,
    });
  }
};
