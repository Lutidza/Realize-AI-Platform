/**
 * @file packages/payload-ai-plugin/src/chat-context/toStoredWorkflowSummary.mapper.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Отделяет публичный прогресс процесса от закрытого сохранённого checkpoint.
 */
import type { WorkflowRunSummary } from "@realize/ai-contracts";
import {
  parseAIChatConfigurationSnapshot,
  parseWorkflowCheckpoint,
  toWorkflowRunSummary,
} from "@realize/change-engine";

export const toStoredWorkflowSummary = (
  value: unknown,
): WorkflowRunSummary | undefined => {
  if (
    !value ||
    typeof value !== "object" ||
    !("workflow" in value) ||
    !value.workflow
  )
    return undefined;
  if (!("agentConfiguration" in value))
    throw new Error("Stored workflow has no configuration.");
  const configuration = parseAIChatConfigurationSnapshot(
    value.agentConfiguration,
  );
  return toWorkflowRunSummary(
    configuration,
    parseWorkflowCheckpoint(configuration, value.workflow),
  );
};
