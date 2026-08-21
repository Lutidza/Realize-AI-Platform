/**
 * @file packages/payload-ai-plugin/src/endpoints/eventPersistence.ts
 * @version 2026-08-17
 * @description Applies validated stream events to the durable site projection.
 */

import type { AIStreamEvent, UsageSummary } from "@realize/ai-contracts";

import { AIRepository } from "./repository";
import { redactPayload, redactText } from "./redaction";

const eventTypes = new Set<AIStreamEvent["type"]>([
  "assistant.completed",
  "assistant.delta",
  "run.cancelled",
  "run.failed",
  "run.started",
  "tool.completed",
  "tool.started",
  "usage.updated",
]);

export const parseControlPlaneEvent = (
  value: unknown,
  runID: string,
): AIStreamEvent => {
  if (!value || typeof value !== "object")
    throw new Error("Invalid control-plane event.");
  const event = value as Record<string, unknown>;
  if (typeof event.id !== "string" || event.runID !== runID)
    throw new Error("Invalid event identity.");
  if (
    typeof event.sequence !== "number" ||
    !Number.isInteger(event.sequence) ||
    event.sequence < 1
  ) {
    throw new Error("Invalid event sequence.");
  }
  if (
    typeof event.type !== "string" ||
    !eventTypes.has(event.type as AIStreamEvent["type"])
  ) {
    throw new Error("Invalid event type.");
  }
  if (
    !event.payload ||
    typeof event.payload !== "object" ||
    Array.isArray(event.payload)
  ) {
    throw new Error("Invalid event payload.");
  }
  if (
    !["internal-summary", "redacted", "user-visible"].includes(
      String(event.visibility),
    )
  ) {
    throw new Error("Invalid event visibility.");
  }

  return {
    createdAt:
      typeof event.createdAt === "string"
        ? event.createdAt
        : new Date().toISOString(),
    id: event.id,
    payload: redactPayload(event.payload as Record<string, unknown>),
    runID,
    sequence: event.sequence,
    type: event.type as AIStreamEvent["type"],
    visibility: event.visibility as AIStreamEvent["visibility"],
  };
};

export const persistAndApplyEvent = async (
  repository: AIRepository,
  event: AIStreamEvent,
): Promise<void> => {
  const created = await repository.persistEvent(event);
  if (!created) return;

  if (event.type === "run.started") {
    await repository.updateRun(event.runID, {
      eventCursor: event.sequence,
      startedAt: event.createdAt,
      status: "running",
      threadID:
        typeof event.payload.threadID === "string"
          ? event.payload.threadID
          : undefined,
    });
  } else if (event.type === "usage.updated") {
    await repository.updateRun(event.runID, {
      eventCursor: event.sequence,
      usage: event.payload.usage as UsageSummary,
    });
  } else if (event.type === "assistant.completed") {
    const content = redactText(String(event.payload.content || "")).slice(
      0,
      200_000,
    );
    await repository.persistAssistantMessage(event, content);
    await repository.updateRun(event.runID, {
      eventCursor: event.sequence,
      finishedAt: event.createdAt,
      status: "completed",
    });
  } else if (event.type === "run.cancelled") {
    await repository.updateRun(event.runID, {
      eventCursor: event.sequence,
      finishedAt: event.createdAt,
      status: "cancelled",
    });
  } else if (event.type === "run.failed") {
    await repository.updateRun(event.runID, {
      errorSummary: redactText(
        String(event.payload.message || "AI run failed."),
      ).slice(0, 1_000),
      eventCursor: event.sequence,
      finishedAt: event.createdAt,
      status: "failed",
    });
  } else {
    await repository.updateRun(event.runID, { eventCursor: event.sequence });
  }
};
