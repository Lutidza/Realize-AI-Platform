/**
 * @file packages/payload-ai-plugin/src/endpoints/dataOperationPlanning.ts
 * @version 1.3.0
 * @date 2026-09-13
 * @description Превращает persisted assistant intent в immutable DataOperation dry-run.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import {
  DataOperationIntentError,
  parseDataOperationIntentFromAssistant,
} from "@realize/change-engine";
import type { Payload, PayloadRequest } from "payload";
import { matchesPageDiscoveryContext } from "../chat-context/pageDiscoveryContext.validator";
import { matchesPageStructureContext } from "../chat-context/pageStructureContext.validator";
import { relationID } from "./mappers";
import { assertDataOperationSource } from "./assertDataOperationSource.validator";
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
  try {
    const intent = parseDataOperationIntentFromAssistant(
      String(assistant.content || ""),
    );
    if (existing) {
      assertDataOperationSource(existing, { ...input, intent });
      return existing;
    }
    if (
      intent.kind === "pages.updateDraft.v1" ||
      intent.kind === "pages.updateStructureDraft.v1"
    ) {
      const run = await new AIRepository(input.payload, input.req).getRun(
        String(assistant.runID || ""),
        input.userID,
      );
      if (relationID(run.conversation) !== input.conversationID)
        throw new EndpointError(
          "CONFLICT",
          "Исходный ответ не принадлежит этому диалогу. Запросите новое предложение.",
          409,
        );
      const matches =
        intent.kind === "pages.updateStructureDraft.v1"
          ? matchesPageStructureContext(run.turnContext, intent)
          : matchesPageDiscoveryContext(run.turnContext, intent);
      if (!matches)
        throw new EndpointError(
          "CONFLICT",
          "Предложение не соответствует странице, прочитанной в исходном ответе. Попросите агента перечитать страницу и подготовить новое предложение.",
          409,
        );
    }
    return await createTypedDataOperationPlan({
      ...input,
      intent,
      source: { type: "assistant", idempotencyKey: input.idempotencyKey },
    });
  } catch (error) {
    if (error instanceof DataOperationIntentError)
      throw new EndpointError("INVALID_REQUEST", error.message, 400);
    throw error;
  }
};
