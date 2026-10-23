/**
 * @file .ai/tools/git-delivery/src/worker/runGitInspect.service.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Выполняет разрешённый Git inspect программно и возвращает отчёт без модельной сессии.
 * @see documentation/architecture/decisions/ADR-0016-development-git-delivery-handler.md
 */
import { PolicyError } from "@realize/git-runtime";
import { validateGitWorkerContext } from "./validateGitWorkerContext.validator.ts";
import type {
  GitWorkerContext,
  GitWorkerDependencies,
  GitWorkerReport,
} from "./GitWorker.types.ts";

/** Фиксированное действие не принимает argv или полномочия модели; handler сохраняет Git guards. */
export async function runGitInspect(
  context: GitWorkerContext,
  deliver: GitWorkerDependencies["deliver"],
  externalSignal?: AbortSignal,
): Promise<GitWorkerReport> {
  const started = performance.now();
  const deadline = AbortSignal.timeout(60_000);
  const signal = externalSignal
    ? AbortSignal.any([deadline, externalSignal])
    : deadline;
  const report: GitWorkerReport = {
    version: 1,
    status: "blocked",
    errorCode: null,
    result: null,
    command: { action: "inspect" },
    worker: {
      model: null,
      threadId: null,
      turnId: null,
      durationMs: 0,
      handlerCalls: 0,
      instructionBytes: 0,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
    },
  };
  try {
    signal.throwIfAborted();
    const trusted = structuredClone(
      validateGitWorkerContext("inspect", context),
    );
    report.worker.handlerCalls = 1;
    // Начатое чтение дожидается handler с его Git timeout и освобождением lock.
    // Отмена не теряет фактический результат и не оставляет фоновую операцию.
    report.result = await deliver({ action: "inspect" }, trusted);
    signal.throwIfAborted();
    report.status =
      report.result.status === "succeeded" || report.result.status === "noop"
        ? "succeeded"
        : report.result.status === "failed" ||
            report.result.status === "partial"
          ? "failed"
          : "blocked";
    report.errorCode = report.result.errorCode;
  } catch (error) {
    report.status =
      signal.aborted || error instanceof PolicyError ? "blocked" : "failed";
    report.errorCode = deadline.aborted
      ? "worker_timeout"
      : externalSignal?.aborted
        ? "worker_cancelled"
        : error instanceof PolicyError
          ? error.code
          : "worker_operation_failed";
  } finally {
    report.worker.durationMs = Math.round(performance.now() - started);
  }
  return report;
}
