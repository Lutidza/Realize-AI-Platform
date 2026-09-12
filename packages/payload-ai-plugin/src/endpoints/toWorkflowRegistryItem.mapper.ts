/**
 * @file packages/payload-ai-plugin/src/endpoints/toWorkflowRegistryItem.mapper.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Проецирует актуальный сегмент в строку реестра и доступные lifecycle-действия.
 */

import type {
  WorkflowRegistryItem,
  WorkflowRegistryStatus,
} from "@realize/ai-contracts";
import { toConversationDTO, toRunDTO } from "./mappers";
import { EndpointError } from "./http";
import type { WorkflowRegistryItemInput } from "./WorkflowRunProjection.types";

/** Read-only проекция не проверяет доступность CP и никогда не запускает продолжение. */
export const toWorkflowRegistryItem = (
  input: WorkflowRegistryItemInput,
): WorkflowRegistryItem => {
  const run = (() => {
    try {
      return toRunDTO(input.latestRun);
    } catch {
      throw new EndpointError(
        "CONFLICT",
        "Сохранённый процесс не прошёл проверку целостности.",
        409,
      );
    }
  })();
  const workflow = run.workflow;
  if (!workflow)
    throw new EndpointError(
      "CONFLICT",
      "Запуск не содержит сохранённого процесса.",
      409,
    );
  const conversation = toConversationDTO(input.conversation);
  const active = run.status === "queued" || run.status === "running";
  const status: WorkflowRegistryStatus =
    active || run.status === "failed" || run.status === "cancelled"
      ? (run.status as WorkflowRegistryStatus)
      : workflow.phase;
  const archived = conversation.status === "archived";
  const canContinue = input.enabled && !archived && run.status === "completed";
  const reason = archived
    ? "Архивный диалог доступен только для чтения."
    : !input.enabled
      ? "ИИ-функции выключены."
      : workflow.phase === "blocked"
        ? workflow.reason
        : undefined;
  return {
    rootRunID: input.rootRunID,
    latestRun: run,
    conversation: {
      id: conversation.id,
      title: conversation.title,
      status: conversation.status,
    },
    status,
    createdAt: input.rootCreatedAt,
    updatedAt: run.updatedAt,
    segmentCount: input.segmentCount,
    actions: {
      continue: canContinue && workflow.phase === "ready",
      reply: canContinue && workflow.phase === "awaiting_input",
      recover:
        input.enabled &&
        !archived &&
        run.status === "queued" &&
        workflow.phase === "running",
      cancel: !archived && active,
      ...(reason ? { reason } : {}),
    },
  };
};
