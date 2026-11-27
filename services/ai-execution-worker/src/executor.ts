/**
 * @file services/ai-execution-worker/src/executor.ts
 * @version 1.4.4
 * @date 2026-11-27
 * @description Проверяет разрешённую реализацию и сохраняет безопасное пояснение исполнителя при любом исходе.
 */

import type { UsageRuntime } from "@realize/payload-ai-control/server/usage";
import { createHash } from "node:crypto";

import type { AgentEvent, SearchObservation } from "@realize/ai-contracts";
import type { SearchObservationCollectorStore } from "@realize/payload-ai-control/server/search-observability";
import { createRepositoryRunAccess } from "../../ai-control-plane/src/createRepositoryRunAccess.service";
import {
  assessExecutionScope,
  parseAIExecutionContext,
  hashCanonicalJSON,
  verifyExecutionCapability,
} from "@realize/change-engine";
import { OpenAICodexAdapter } from "@realize/codex-adapter";
import type { CodexConnectionResolver } from "@realize/payload-ai-control/server/integration-runtime";

import {
  buildExecutionInstructions,
  buildExecutionTaskPrompt,
} from "./buildExecutionInstructions.service";
import { runExecutionCheck } from "./checkRunner";
import type { ExecutionWorkerConfig } from "./config";
import { ExecutionJobRepository } from "./jobRepository";
import { sanitizeExecutionOutput } from "./sanitizeExecutionOutput.util";
import type { ClaimedExecutionJob, WorkerCheckResult } from "./types";
import { withWorkspaceDependencies } from "./workspaceDependencies";
import { createExecutionWorktree } from "./worktree";
import { verifyWorktreeChange } from "./verifyWorktreeChange.service";
import { WorktreePolicyError } from "./WorktreePolicy.error";

class ValidationFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationFailure";
  }
}

const runAgent = async (input: {
  config: ExecutionWorkerConfig;
  codex: CodexConnectionResolver;
  usage: Pick<UsageRuntime, "meter" | "measureOperation">;
  job: ClaimedExecutionJob;
  workspace: string;
  onSummary: (summary: string) => void;
  observeSearch?: (event: SearchObservation) => void;
  searchObservationStore?: SearchObservationCollectorStore;
}): Promise<void> => {
  const lease = await input.codex.acquire({ isolated: true });
  let access: Awaited<ReturnType<typeof createRepositoryRunAccess>>;
  try {
    access = await createRepositoryRunAccess({
      root: input.workspace,
      runID: input.job.executionKey,
      consumer: "execution",
      search: lease.search,
      signal: lease.signal,
      observe: input.observeSearch,
      observationStore: input.searchObservationStore,
      handoffRoot: input.config.repositoryRoot,
    });
  } catch (error) {
    await lease.dispose();
    throw error;
  }
  const adapter = new OpenAICodexAdapter({
    codexBinary: input.config.codexBinary,
    environment: { ...lease.environment, ...access?.environment },
    repositoryMcpURL: access?.url,
    signal: lease.signal,
    search: lease.search,
  });
  let failure: string | undefined;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void adapter.cancelRun(input.job.executionKey);
  }, input.config.turnTimeoutMs);
  timer.unref();
  try {
    for await (const event of input.usage
      .meter(adapter, {
        changeRequestId: String(input.job.changeRequestID),
        taskId: `change:${input.job.changeRequestID}`,
        source: "execution",
        authMode: lease.authMode,
        model: lease.model,
      })
      .runTurn({
        cwd: input.workspace,
        developerInstructions: buildExecutionInstructions(
          input.job,
          lease.search,
        ),
        // Дочернему поиску нужна история родителя; private lease удаляет её после закрытия процесса.
        ephemeral: false,
        model: lease.model,
        prompt: buildExecutionTaskPrompt(input.job, lease.search),
        runID: input.job.executionKey,
        sandboxProfile: "code-workspace-write",
      })) {
      const normalized = event as AgentEvent;
      if (normalized.type === "assistant.completed") {
        input.onSummary(normalized.content);
      } else if (normalized.type === "run.failed") {
        failure = normalized.message;
      } else if (normalized.type === "run.cancelled" && !timedOut) {
        failure = "Codex implementation turn was cancelled.";
      }
    }
  } finally {
    clearTimeout(timer);
    try {
      await access?.close();
    } finally {
      await lease.dispose();
    }
  }
  if (timedOut) throw new Error("Codex implementation turn timed out.");
  if (failure) throw new Error(failure);
};

/** Исполняет уже арендованное задание и сохраняет каждый итоговый переход. */
export const executeClaimedJob = async (input: {
  config: ExecutionWorkerConfig;
  codex: CodexConnectionResolver;
  usage: Pick<UsageRuntime, "meter" | "measureOperation">;
  job: ClaimedExecutionJob;
  repository: ExecutionJobRepository;
  observeSearch?: (event: SearchObservation) => void;
  searchObservationStore?: SearchObservationCollectorStore;
}): Promise<void> => {
  let validationPhase = false;
  let workspace = "";
  let workerSummary: string | undefined;
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
    try {
      const context = parseAIExecutionContext(input.job.executionContext);
      if (
        context.contextHash !== input.job.capability.executionContextHash ||
        hashCanonicalJSON({
          paths: input.job.allowedPaths,
          checks: input.job.checks,
          base: input.job.baseCommit,
          plan: input.job.planHash,
          scope: input.job.scopeHash,
          id: String(input.job.changeRequestID),
          key: input.job.executionKey,
          version: input.job.approvedVersion,
        }) !==
          hashCanonicalJSON({
            paths: input.job.capability.allowedPaths,
            checks: input.job.capability.checks,
            base: input.job.capability.baseCommit,
            plan: input.job.capability.planHash,
            scope: input.job.capability.scopeHash,
            id: input.job.capability.changeRequestID,
            key: input.job.capability.executionKey,
            version: input.job.capability.version,
          })
      )
        throw new Error("Job differs from the signed execution capability.");
      if (
        createHash("sha256").update(input.job.plan.trim()).digest("hex") !==
          input.job.planHash ||
        createHash("sha256")
          .update(
            JSON.stringify({
              affectedPaths: input.job.allowedPaths,
              checks: input.job.checks,
            }),
          )
          .digest("hex") !== input.job.scopeHash
      )
        throw new Error("Plan text or scope differs from approved evidence.");
      const scope = assessExecutionScope({
        affectedPaths: input.job.allowedPaths,
        checks: input.job.checks,
        type: "CODE_CHANGE",
      });
      if (!scope.allowed) throw new Error(scope.reason);
      buildExecutionInstructions(input.job);
    } catch (error) {
      throw new WorktreePolicyError(
        error instanceof Error ? error.message : "Invalid execution context.",
      );
    }
    workspace = await createExecutionWorktree({
      job: input.job,
      repositoryRoot: input.config.repositoryRoot,
      workspaceRoot: input.config.workspaceRoot,
    });
    await input.repository.markRunning(input.job);
    await runAgent({
      config: input.config,
      codex: input.codex,
      usage: input.usage,
      job: input.job,
      workspace,
      observeSearch: input.observeSearch,
      searchObservationStore: input.searchObservationStore,
      onSummary: (value) => {
        // Это пояснение модели, а не свидетельство успешного diff/check; последующая ошибка его не теряет.
        workerSummary = value.trim()
          ? sanitizeExecutionOutput(value, [
              input.config.repositoryRoot,
              workspace,
            ])
          : undefined;
      },
    });
    const checkResults: WorkerCheckResult[] = [];
    const diff = await verifyWorktreeChange(workspace, input.job, async () => {
      validationPhase = true;
      await input.repository.markValidating(input.job);
      await withWorkspaceDependencies(
        input.config.repositoryRoot,
        workspace,
        async (dependencyLease) => {
          for (const [index, command] of input.job.checks.entries()) {
            const result = await input.usage.measureOperation(
              {
                source: "build",
                operationKey: `execution-check:${index + 1}`,
                taskId: `change:${input.job.changeRequestID}`,
                changeRequestId: String(input.job.changeRequestID),
              },
              () =>
                runExecutionCheck({
                  command,
                  repositoryRoot: input.config.repositoryRoot,
                  verification: {
                    changeRequestID: input.job.changeRequestID,
                    dependencyLease,
                    reason: `Проверка включена в одобренный план change:${input.job.changeRequestID}, plan:${input.job.planHash}.`,
                  },
                  workspace,
                }),
              (result) => result.status === "passed",
            );
            checkResults.push(result);
            await input.repository.addCheckResult(input.job, result, index + 1);
            if (result.status === "failed") {
              throw new ValidationFailure(`Required check failed: ${command}`);
            }
          }
        },
      );
    });
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
      workerSummary,
    );
  } catch (error) {
    const summary = sanitizeExecutionOutput(
      error instanceof Error ? error.message : "Execution worker failed.",
      [input.config.repositoryRoot, workspace].filter(Boolean),
    );
    await input.repository.fail(input.job, {
      blocked: error instanceof WorktreePolicyError,
      summary,
      workerSummary,
      validationFailure: validationPhase || error instanceof ValidationFailure,
    });
  }
};
