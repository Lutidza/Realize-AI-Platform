/**
 * @file services/ai-execution-worker/src/checkRunner.ts
 * @version 2.1.0
 * @date 2026-10-23
 * @description Передаёт server-approved проверки общему runtime и преобразует source-bound evidence в результат worker.
 * @see documentation/delivery/01-local-admin-ai.md
 */
import { createHash } from "node:crypto";
import { runVerification } from "@realize/verification-runtime";
import type { ExecutionCheckInput } from "./ExecutionVerification.types";
import { createExecutionVerificationPlan } from "./createExecutionVerificationPlan.config";
import { sanitizeExecutionOutput } from "./sanitizeExecutionOutput.util";
import type { WorkerCheckResult } from "./types";

/** Общий runner владеет запуском, receipts, повторным использованием и завершением subprocess. */
export async function runExecutionCheck(
  input: ExecutionCheckInput,
): Promise<WorkerCheckResult> {
  const started = new Date();
  const plan = createExecutionVerificationPlan(input);
  const report = await runVerification(plan, {
    storage: {
      root: input.repositoryRoot,
      directory: ".ai-workspace/runtime/verification",
    },
    dependencyLease: input.verification.dependencyLease,
    portability: "content",
    ...(input.command === "npm run typecheck"
      ? { additionalInputs: [".next/types", ".next/dev/types"] }
      : {}),
  });
  const result = report.checks[0];
  const finished = new Date();
  const status =
    report.success && result?.status === "passed" ? "passed" : "failed";
  const diagnostic =
    result?.diagnostic ?? result?.evidence?.result.diagnostic ?? "";
  const process = result?.evidence?.result;
  const termination =
    status === "failed" && process
      ? `\n[execution-check] exitCode=${process.exitCode ?? "null"}; signal=${process.signal ?? "none"}; timedOut=${process.timedOut}`
      : "";
  const marker = result?.reused
    ? `[verification] Использован сохранённый результат; receipt=${result.receiptId}.`
    : `[verification] ${result?.status ?? "blocked"}${result?.reason ? `; reason=${result.reason}` : ""}.`;
  return {
    command: input.command,
    durationMs: finished.getTime() - started.getTime(),
    evidenceHash: createHash("sha256")
      .update(
        JSON.stringify([
          input.command,
          status,
          result?.key,
          result?.recipeKey,
          result?.receiptId,
          result?.evidence?.result,
        ]),
      )
      .digest("hex"),
    finishedAt: finished.toISOString(),
    outputSummary: sanitizeExecutionOutput(
      `${diagnostic}${termination}\n${marker}`,
      [input.repositoryRoot, input.workspace],
      "check",
    ),
    startedAt: started.toISOString(),
    status,
  };
}
