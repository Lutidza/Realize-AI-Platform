/**
 * @file packages/payload-ai-plugin/src/endpoints/handlers.ts
 * @version 1.2.1
 * @date 2026-09-11
 * @description Реализует conversation, run, cancellation и runtime-status handlers.
 */

import { createChatMessage } from "../chat-context/createChatMessage.service";
import { cancelWorkflowRun } from "../chat-context/cancelWorkflowRun.service";

import {
  parseCreateConversationInput,
  parseCreateMessageInput,
  parseIdentifier,
  type ConversationDetailDTO,
} from "@realize/ai-contracts";
import type { PayloadHandler as PayloadEndpointHandler } from "payload";

import type { SanitizedRealizeAIPluginOptions } from "../types";
import { getControlPlaneClient } from "../runtime/getControlPlaneClient";
import { resolveRuntimeStatus } from "../runtime/resolveRuntimeStatus.service";
import { consumeRateLimit, requireChatUser } from "./access";
import { ChangeRepository } from "./changeRepository";
import { projectChangeRequest } from "./changeProjection";
import { projectDataOperation } from "./dataOperationProjection";
import { DataOperationRepository } from "./dataOperationRepository";
import { DeploymentRepository } from "./deploymentRepository";
import { ExecutionRepository } from "./executionRepository";
import { EndpointError, success } from "./http";
import { toConversationDTO, toMessageDTO, toRunDTO } from "./mappers";
import { redactText } from "./redaction";
import { AIRepository } from "./repository";
import { idempotencyKeyFor, readBody, withHandler } from "./request";
import { ReleaseRepository } from "./releaseRepository";
import { SourcePromotionRepository } from "./sourcePromotionRepository";

export const createConversationHandlers = (
  options: SanitizedRealizeAIPluginOptions,
): {
  archive: PayloadEndpointHandler;
  create: PayloadEndpointHandler;
  detail: PayloadEndpointHandler;
  list: PayloadEndpointHandler;
  message: PayloadEndpointHandler;
} => ({
  archive: withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    consumeRateLimit(user.id);
    idempotencyKeyFor(req);
    const id = parseIdentifier(req.routeParams?.id, "conversation id");
    const conversation = await new AIRepository(
      req.payload,
      req,
    ).archiveConversation(id, user.id);
    return success(toConversationDTO(conversation), correlationID);
  }),

  create: withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    if (!options.enabled)
      throw new EndpointError(
        "AI_DISABLED",
        options.runtimeStatus?.reason ?? "Административный агент выключен.",
        409,
      );
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const input = parseCreateConversationInput(await readBody(req));
    const repository = new AIRepository(req.payload, req);
    const existing = await repository.findConversationByIdempotencyKey(
      user.id,
      idempotencyKey,
    );
    if (existing) return success(toConversationDTO(existing), correlationID);
    let conversation;
    try {
      conversation = await repository.createConversation(
        redactText(input.title || "Новый диалог"),
        user.id,
        idempotencyKey,
      );
    } catch (error) {
      const concurrent = await repository.findConversationByIdempotencyKey(
        user.id,
        idempotencyKey,
      );
      if (concurrent)
        return success(toConversationDTO(concurrent), correlationID);
      throw error;
    }
    return success(toConversationDTO(conversation), correlationID, 201);
  }),

  detail: withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    const id = parseIdentifier(req.routeParams?.id, "conversation id");
    const [detail, changes, dataOperations] = await Promise.all([
      new AIRepository(req.payload, req).getConversationDetail(id, user.id),
      new ChangeRepository(req.payload, req).listOwnedChanges(id, user.id),
      new DataOperationRepository(req.payload, req).listOwnedOperations(
        id,
        user.id,
      ),
    ]);
    const executionRepository = new ExecutionRepository(req.payload, req);
    const deploymentRepository = new DeploymentRepository(req.payload, req);
    const releaseRepository = new ReleaseRepository(req.payload, req);
    const sourcePromotionRepository = new SourcePromotionRepository(
      req.payload,
      req,
    );
    const dto: ConversationDetailDTO = {
      changeRequests: await Promise.all(
        changes.map(
          ({
            acceptance,
            approval,
            change,
            previewAcceptance,
            releaseApproval,
          }) =>
            projectChangeRequest({
              acceptance,
              approval,
              change,
              deploymentRepository,
              executionRepository,
              options,
              previewAcceptance,
              releaseApproval,
              releaseRepository,
              sourcePromotionRepository,
            }),
        ),
      ),
      conversation: toConversationDTO(detail.conversation),
      dataOperations: await Promise.all(
        dataOperations.map(({ operation }) =>
          projectDataOperation({ operation, payload: req.payload, req }),
        ),
      ),
      messages: detail.messages.map(toMessageDTO),
      runs: detail.runs.map(toRunDTO),
    };
    return success(dto, correlationID);
  }),

  list: withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    const conversations = await new AIRepository(
      req.payload,
      req,
    ).listConversations(user.id);
    return success(conversations.map(toConversationDTO), correlationID);
  }),

  message: withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    if (!options.enabled)
      throw new EndpointError(
        "AI_DISABLED",
        options.runtimeStatus?.reason ?? "Административный агент выключен.",
        409,
      );
    consumeRateLimit(user.id);
    const conversationID = parseIdentifier(
      req.routeParams?.id,
      "conversation id",
    );
    const idempotencyKey = idempotencyKeyFor(req);
    const input = parseCreateMessageInput(await readBody(req));
    const result = await createChatMessage(
      req,
      options,
      user.id,
      conversationID,
      idempotencyKey,
      input,
    );
    return success(result, correlationID, result.message ? 202 : 200);
  }),
});

export const createRunHandlers = (
  options: SanitizedRealizeAIPluginOptions,
): {
  cancel: PayloadEndpointHandler;
  detail: PayloadEndpointHandler;
} => ({
  cancel: withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    consumeRateLimit(user.id);
    idempotencyKeyFor(req);
    const id = parseIdentifier(req.routeParams?.id, "run id");
    const repository = new AIRepository(req.payload, req);
    const run = await repository.getRun(id, user.id);
    if (String(run.status) === "cancelled") {
      return success({ accepted: true, runID: id }, correlationID);
    }
    if (!["queued", "running"].includes(String(run.status))) {
      throw new EndpointError(
        "CONFLICT",
        "Only queued or running runs can be cancelled.",
        409,
      );
    }
    if (
      run.turnContext &&
      typeof run.turnContext === "object" &&
      "workflow" in run.turnContext &&
      run.turnContext.workflow
    ) {
      await cancelWorkflowRun(req, options, user.id, id);
    } else {
      await getControlPlaneClient(options).cancelRun(id);
    }
    return success({ accepted: true, runID: id }, correlationID, 202);
  }),

  detail: withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    const id = parseIdentifier(req.routeParams?.id, "run id");
    const run = await new AIRepository(req.payload, req).getRun(id, user.id);
    return success(toRunDTO(run), correlationID);
  }),
});

export const createStatusHandler = (
  options: SanitizedRealizeAIPluginOptions,
): PayloadEndpointHandler => {
  return withHandler(async (req, correlationID) => {
    await requireChatUser(req, options);

    return success(await resolveRuntimeStatus(options), correlationID);
  });
};
