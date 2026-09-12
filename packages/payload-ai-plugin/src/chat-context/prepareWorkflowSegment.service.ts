/**
 * @file packages/payload-ai-plugin/src/chat-context/prepareWorkflowSegment.service.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Выполняет серверные шаги до одного вызова модели, вопроса или завершения.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/10-ai-codex-layer-integration.md
 */
import {
  ContractValidationError,
  type AIStreamEvent,
} from "@realize/ai-contracts";
import {
  advanceWorkflowBranch,
  awaitWorkflowInput,
  blockWorkflow,
  completeWorkflowStep,
  finishWorkflow,
  getWorkflowStep,
  parseWorkflowCheckpoint,
  renderWorkflowInputPrompt,
  resolveWorkflowCapabilityInput,
  startWorkflowAgentTurn,
  AIConfigurationPolicyError,
} from "@realize/change-engine";
import { executeWorkflowCapability } from "../endpoints/executeWorkflowCapability.service";
import { executeWorkflowCheck } from "../endpoints/executeWorkflowCheck.service";
import { EndpointError } from "../endpoints/http";
import { redactText } from "../endpoints/redaction";
import type { WorkflowSegmentInput } from "./WorkflowSegment.types";

/** Вызывается внутри транзакции создания run: preview, checkpoint и receipt коммитятся вместе. */
export const prepareWorkflowSegment = async (input: WorkflowSegmentInput) => {
  const { context, repository, run, req, options, userID, conversationID } =
    input;
  const configuration = context.agentConfiguration;
  if (!configuration || !context.workflow || !context.workflowSourceMessageID)
    throw new Error("Workflow segment is missing its persisted context.");
  let checkpoint = parseWorkflowCheckpoint(configuration, context.workflow);
  let content = "";
  try {
    while (checkpoint.phase === "ready") {
      const step = getWorkflowStep(configuration, checkpoint);
      switch (step.type) {
        case "branch":
          checkpoint = advanceWorkflowBranch(configuration, checkpoint);
          break;
        case "finish":
          checkpoint = finishWorkflow(configuration, checkpoint);
          content =
            checkpoint.phase === "completed"
              ? checkpoint.lastCapability
                ? "Рабочий процесс завершён. Подготовленные изменения данных требуют отдельного подтверждения и применения."
                : "Рабочий процесс завершён."
              : "Рабочий процесс завершён с результатом «Заблокирован».";
          break;
        case "request_input":
          content = renderWorkflowInputPrompt(configuration, checkpoint);
          checkpoint = awaitWorkflowInput(configuration, checkpoint);
          break;
        case "agent_turn":
          checkpoint = startWorkflowAgentTurn(configuration, checkpoint);
          break;
        case "capability": {
          const result = await executeWorkflowCapability({
            req,
            options,
            userID,
            conversationID,
            sourceMessageID: context.workflowSourceMessageID,
            rootRunID: checkpoint.rootRunID || String(run.id),
            stepKey: step.key,
            configuration,
            capabilityBindingKey: step.capabilityBindingKey,
            input: resolveWorkflowCapabilityInput(step, checkpoint),
          });
          checkpoint = completeWorkflowStep(
            configuration,
            checkpoint,
            result.output,
            result.lastCapability,
          );
          break;
        }
        case "check": {
          const output = await executeWorkflowCheck({
            req,
            options,
            userID,
            conversationID,
            configuration,
            rootRunID: checkpoint.rootRunID || String(run.id),
            checkBindingKey: step.checkBindingKey,
            lastCapability: checkpoint.lastCapability,
          });
          checkpoint = completeWorkflowStep(configuration, checkpoint, output);
          break;
        }
      }
    }
  } catch (error) {
    // Не превращаем неизвестную инфраструктурную ошибку в коммит частичной транзакции.
    if (
      !(error instanceof EndpointError) &&
      !(error instanceof AIConfigurationPolicyError) &&
      !(error instanceof ContractValidationError)
    )
      throw error;
    const reason = redactText(error.message).slice(0, 500);
    checkpoint = blockWorkflow(configuration, checkpoint, reason);
    content = `Процесс остановлен: ${reason}`;
  }
  const turnContext = { ...context, workflow: checkpoint };
  if (checkpoint.phase === "running")
    return await repository.updateRun(String(run.id), { turnContext });

  const event: AIStreamEvent = {
    id: `workflow:${run.id}:completed`,
    runID: String(run.id),
    sequence: 1,
    createdAt: new Date().toISOString(),
    type: "assistant.completed",
    visibility: "user-visible",
    payload: { content: redactText(content) },
  };
  await repository.persistEvent(event);
  await repository.persistAssistantMessage(
    event,
    String(event.payload.content),
  );
  return await repository.updateRun(String(run.id), {
    turnContext,
    status: "completed",
    finishedAt: event.createdAt,
    eventCursor: 1,
  });
};
