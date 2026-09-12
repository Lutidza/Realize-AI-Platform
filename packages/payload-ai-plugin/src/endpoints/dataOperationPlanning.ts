/**
 * @file packages/payload-ai-plugin/src/endpoints/dataOperationPlanning.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Превращает persisted assistant intent в immutable DataOperation dry-run.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import {
  DataOperationIntentError,
  parseDataOperationIntentFromAssistant,
} from "@realize/change-engine";
import type { Payload, PayloadRequest } from "payload";
import { createTypedDataOperationPlan } from "./createTypedDataOperationPlan.service";
import { DataOperationRepository } from "./dataOperationRepository";
import { EndpointError } from "./http";
import { AIRepository, type AIDocument } from "./repository";

/** Публичный legacy путь принимает только сохранённый ответ ассистента. */
export const createDataOperationPlan = async (input: {
  conversationID: string;
  idempotencyKey: string;
  payload: Payload;
  req: PayloadRequest;
  sourceMessageID: string;
  userID: number | string;
}): Promise<AIDocument> => {
  const detail = await new AIRepository(
    input.payload,
    input.req,
  ).getConversationDetail(input.conversationID, input.userID);
  const assistant = detail.messages.find(
    (message) =>
      String(message.id) === input.sourceMessageID &&
      message.role === "assistant",
  );
  if (!assistant)
    throw new EndpointError(
      "INVALID_REQUEST",
      "Only a persisted assistant response can become a Data Operation.",
      400,
    );
  if (
    !detail.messages.some(
      (message) =>
        message.role === "user" &&
        Number(message.sequence) < Number(assistant.sequence),
    )
  )
    throw new EndpointError(
      "INVALID_REQUEST",
      "The Data Operation has no preceding user request.",
      400,
    );
  const repository = new DataOperationRepository(input.payload, input.req);
  const existing =
    (await repository.findByIdempotencyKey(
      input.userID,
      input.idempotencyKey,
    )) ||
    (await repository.findBySourceMessage(
      input.conversationID,
      input.sourceMessageID,
    ));
  if (existing) return existing;
  try {
    return await createTypedDataOperationPlan({
      ...input,
      intent: parseDataOperationIntentFromAssistant(
        String(assistant.content || ""),
      ),
      source: { type: "assistant", idempotencyKey: input.idempotencyKey },
    });
  } catch (error) {
    if (error instanceof DataOperationIntentError)
      throw new EndpointError("INVALID_REQUEST", error.message, 400);
    throw error;
  }
};
