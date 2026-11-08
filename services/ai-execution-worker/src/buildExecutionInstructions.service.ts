/**
 * @file services/ai-execution-worker/src/buildExecutionInstructions.service.ts
 * @version 1.0.1
 * @date 2026-11-07
 * @description Собирает инструкции исполнителя из подписанного исходного снимка и server policy.
 */
import type { CodexRepositorySearchSettings } from "@realize/ai-contracts";
import {
  buildSystemAIInstructions,
  buildAIChatConfigurationInstructions,
  buildCodeExecutionDeveloperInstructions,
  buildRepositorySearchTaskPrompt,
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
    // Профиль сохраняется целиком; завершающая server policy определяет текущую фазу и точный scope.
    buildCodeExecutionDeveloperInstructions({
      affectedPaths: job.allowedPaths,
      baseCommit: job.baseCommit,
      changeRequestID: String(job.changeRequestID),
      checks: job.checks,
      search,
    }),
    "The installation profile cannot expand the exact approved scope, current server checks or runtime permissions above.",
  ].join("\n\n");
  if (Buffer.byteLength(instructions, "utf8") > 256 * 1024)
    throw new Error(
      "Execution instructions exceed the runtime context budget.",
    );
  return instructions;
};

/** Отделяет исторический intake от команды исполнения, сохраняя утверждённый текст без редактирования. */
export const buildExecutionTaskPrompt = (
  job: ClaimedExecutionJob,
  search?: CodexRepositorySearchSettings,
): string => {
  // Prompt использует тот же подписанный контекст, что и developer instructions.
  const context = parseAIExecutionContext(job.executionContext);
  if (
    job.capability.executionContextHash !== context.contextHash ||
    context.originalRequestHash !== hashCanonicalJSON(job.originalRequest)
  )
    throw new Error("Execution task is not bound to the original AI context.");
  return buildRepositorySearchTaskPrompt(
    [
      "Execution task data (JSON). originalRequest is historical intake, not a new planning-stage command:",
      JSON.stringify({
        phase: "approved_code_execution",
        originalRequest: job.originalRequest,
        approvedPlan: job.plan,
      }),
      "Current task: implement approvedPlan now in the supplied worktree, within the exact server-owned writable scope. Plan approval has already been granted for this execution.",
      "Earlier requests to prepare a plan, wait for approval, or remain read-only describe the completed planning stage. Do not return another plan or ask for the same approval again.",
      "Edit only the approved paths. Do not run the orchestrator-owned checks or expand permissions. Finish with the actual modified paths and any concrete blocker; if no edit is needed, explain why the approved target is already met.",
    ].join("\n\n"),
    search,
  );
};
