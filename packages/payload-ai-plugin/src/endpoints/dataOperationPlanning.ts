/**
 * @file packages/payload-ai-plugin/src/endpoints/dataOperationPlanning.ts
 * @version 2026-08-28
 * @description Превращает persisted assistant intent в immutable DataOperation dry-run.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import {
  createCategoryAssignmentOperationHash,
  createCategoryAssignmentRollbackHash,
  DataOperationIntentError,
  parseDataOperationIntentFromAssistant,
} from "@realize/change-engine";
import type { Payload, PayloadRequest } from "payload";

import { CatalogCategoryAssignment } from "./catalogCategoryAssignment";
import { DataOperationAuditRepository } from "./dataOperationAuditRepository";
import { DataOperationRepository } from "./dataOperationRepository";
import { EndpointError } from "./http";
import { withPayloadTransaction } from "./payloadTransaction";
import { redactText } from "./redaction";
import { AIRepository, type AIDocument } from "./repository";

const sourceMessages = (
  messages: AIDocument[],
  sourceMessageID: string,
): { assistant: AIDocument; originalRequest: AIDocument } => {
  const assistant = messages.find(
    (message) =>
      String(message.id) === sourceMessageID && message.role === "assistant",
  );
  if (!assistant) {
    throw new EndpointError(
      "INVALID_REQUEST",
      "Only a persisted assistant response can become a Data Operation.",
      400,
    );
  }
  const originalRequest = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === "user" &&
        Number(message.sequence) < Number(assistant.sequence),
    );
  if (!originalRequest) {
    throw new EndpointError(
      "INVALID_REQUEST",
      "The Data Operation has no preceding user request.",
      400,
    );
  }
  return { assistant, originalRequest };
};

/** Creates or replays one no-write category assignment dry-run. */
export const createDataOperationPlan = async (input: {
  conversationID: string;
  idempotencyKey: string;
  payload: Payload;
  req: PayloadRequest;
  sourceMessageID: string;
  userID: number | string;
}): Promise<AIDocument> => {
  const conversations = new AIRepository(input.payload, input.req);
  const repository = new DataOperationRepository(input.payload, input.req);
  const audit = new DataOperationAuditRepository(input.payload, input.req);
  const detail = await conversations.getConversationDetail(
    input.conversationID,
    input.userID,
  );
  const source = sourceMessages(detail.messages, input.sourceMessageID);
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

  let intent;
  try {
    intent = parseDataOperationIntentFromAssistant(
      String(source.assistant.content || ""),
    );
  } catch (error) {
    if (error instanceof DataOperationIntentError) {
      throw new EndpointError("INVALID_REQUEST", error.message, 400);
    }
    throw error;
  }

  const resolved = await new CatalogCategoryAssignment(
    input.payload,
    input.req,
  ).dryRun(intent);
  const hashInput = {
    afterCategoryIDs: resolved.afterCategoryIDs,
    beforeCategoryIDs: resolved.beforeCategoryIDs,
    categoryID: resolved.preview.category.id,
    expectedTargetUpdatedAt: resolved.expectedTargetUpdatedAt,
    productID: resolved.preview.product.id,
  };
  const operationHash = createCategoryAssignmentOperationHash(hashInput);
  const rollbackHash = createCategoryAssignmentRollbackHash({
    afterCategoryIDs: resolved.afterCategoryIDs,
    beforeCategoryIDs: resolved.beforeCategoryIDs,
    operationHash,
    productID: resolved.preview.product.id,
  });
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
  const title =
    `Добавить «${resolved.preview.category.title}» товару «${resolved.preview.product.title}»`.slice(
      0,
      120,
    );

  try {
    return await withPayloadTransaction(input.req, async () => {
      const operation = await repository.createOperation({
        afterSnapshot: resolved.preview.afterCategories,
        beforeSnapshot: resolved.preview.beforeCategories,
        categoryID: resolved.preview.category.id,
        categorySnapshot: resolved.preview.category,
        conversationID: input.conversationID,
        expectedTargetUpdatedAt: resolved.expectedTargetUpdatedAt,
        expiresAt,
        idempotencyKey: input.idempotencyKey,
        intent,
        operationHash,
        originalRequest: redactText(
          String(source.originalRequest.content || ""),
        ),
        productID: resolved.preview.product.id,
        productSnapshot: resolved.preview.product,
        requestedBy: input.userID,
        rollbackHash,
        sourceMessageID: input.sourceMessageID,
        title,
      });
      await audit.createEvent({
        actor: input.userID,
        dataOperationID: String(operation.id),
        idempotencyKey: `preview:${operation.id}`,
        payload: {
          categoryID: resolved.preview.category.id,
          expectedTargetUpdatedAt: resolved.expectedTargetUpdatedAt,
          operationHash,
          productID: resolved.preview.product.id,
        },
        toState: "awaiting_approval",
        type: "preview_created",
      });
      return operation;
    });
  } catch (error) {
    const concurrent =
      (await repository.findByIdempotencyKey(
        input.userID,
        input.idempotencyKey,
      )) ||
      (await repository.findBySourceMessage(
        input.conversationID,
        input.sourceMessageID,
      ));
    if (concurrent) return concurrent;
    throw error;
  }
};
