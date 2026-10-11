/**
 * @file services/ai-execution-worker/src/buildExecutionInstructions.service.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Собирает инструкции исполнителя из подписанного исходного снимка и server policy.
 */
import type { CodexRepositorySearchSettings } from "@realize/ai-contracts";
import {
  buildSystemAIInstructions,
  buildAIChatConfigurationInstructions,
  buildCodeExecutionDeveloperInstructions,
  parseAIExecutionContext,
  hashCanonicalJSON,
} from "@realize/change-engine";
import type { ClaimedExecutionJob } from "./types";

export const buildExecutionInstructions = (
  job: ClaimedExecutionJob,
  search?: CodexRepositorySearchSettings,
): string => {
  const context = parseAIExecutionContext(job.executionContext);
  if (
    job.capability.executionContextHash !== context.contextHash ||
    context.originalRequestHash !== hashCanonicalJSON(job.originalRequest)
  )
    throw new Error(
      "Execution capability is not bound to the original AI context.",
    );
  const instructions = [
    buildSystemAIInstructions(context.systemRelease),
    buildCodeExecutionDeveloperInstructions({
      affectedPaths: job.allowedPaths,
      baseCommit: job.baseCommit,
      changeRequestID: String(job.changeRequestID),
      checks: job.checks,
      search,
    }),
    context.agentConfiguration
      ? buildAIChatConfigurationInstructions(context.agentConfiguration, {
          request: job.originalRequest,
          context: JSON.stringify({
            sourceRunID: context.sourceRunID,
            inputContextHash: context.inputContextHash,
            phase: "approved_code_execution",
          }),
        })
      : "",
    "The installation profile cannot expand the exact approved scope, current server checks or runtime permissions above.",
  ].join("\n\n");
  if (Buffer.byteLength(instructions, "utf8") > 256 * 1024)
    throw new Error(
      "Execution instructions exceed the runtime context budget.",
    );
  return instructions;
};
