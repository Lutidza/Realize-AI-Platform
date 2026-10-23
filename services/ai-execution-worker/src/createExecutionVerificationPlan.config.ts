/**
 * @file services/ai-execution-worker/src/createExecutionVerificationPlan.config.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Связывает разрешённую проверку с серверным change request и полным source inventory worktree.
 */
import { createHash } from "node:crypto";
import type { VerificationPlan } from "@realize/verification-runtime";
import type { ExecutionCheckInput } from "./ExecutionVerification.types";
import { createExecutionCheckEnvironment } from "./createExecutionCheckEnvironment.config";
import {
  EXECUTION_VERIFICATION_COMMANDS,
  EXECUTION_VERIFICATION_EXCLUSIONS,
} from "./executionVerificationPolicy.config";

/** Разрешение команды и идентичность проекта задаёт server owner, receipt их не расширяет. */
export function createExecutionVerificationPlan(
  input: ExecutionCheckInput,
): VerificationPlan {
  if (!Object.hasOwn(EXECUTION_VERIFICATION_COMMANDS, input.command))
    throw new Error(`Check is not allowlisted: ${input.command}`);
  if (
    !Number.isSafeInteger(input.verification.changeRequestID) ||
    input.verification.changeRequestID < 1 ||
    input.verification.reason.trim().length < 8
  ) {
    throw new Error("Execution verification requires approved job context.");
  }
  const definition = EXECUTION_VERIFICATION_COMMANDS[input.command];
  return {
    version: 1,
    projectId: `platform-${createHash("sha256").update(input.repositoryRoot).digest("hex")}`,
    taskId: `change-${input.verification.changeRequestID}`,
    repositoryRoot: input.workspace,
    checks: [
      {
        id: createHash("sha256").update(input.command).digest("hex"),
        command: [...definition.command],
        inputs: ["."],
        excludeInputs: [
          ...EXECUTION_VERIFICATION_EXCLUSIONS,
          // Playwright создаёт эти отчёты при каждом запуске; другие checks продолжают учитывать их.
          ...(input.command === "npm run test:e2e"
            ? ["playwright-report", "test-results"]
            : []),
        ],
        environment: createExecutionCheckEnvironment(input),
        timeoutMs: input.timeoutMs ?? 10 * 60 * 1_000,
        reuse: definition.reuse,
        extent: "full",
        reason: input.verification.reason,
      },
    ],
  };
}
