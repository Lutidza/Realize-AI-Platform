/**
 * @file packages/payload-ai-plugin/src/endpoints/handlers.ts
 * @version 2026-08-21
 * @description Implements Phase 1 conversation, run, cancellation and runtime-status handlers.
 */

import { randomUUID } from "node:crypto";

import {
  parseCreateConversationInput,
  parseCreateMessageInput,
  parseIdentifier,
  type AIStreamEvent,
  type ConversationDetailDTO,
  type RuntimeStatusDTO,
} from "@realize/ai-contracts";
import type { PayloadHandler as PayloadEndpointHandler } from "payload";

import type { SanitizedRealizeAIPluginOptions } from "../types";
import { getControlPlaneClient } from "../runtime/getControlPlaneClient";
import { consumeRateLimit, requireChatUser } from "./access";
import { ChangeRepository } from "./changeRepository";
import { projectChangeRequest } from "./changeProjection";
import { DeploymentRepository } from "./deploymentRepository";
import { ExecutionRepository } from "./executionRepository";
import { persistAndApplyEvent } from "./eventPersistence";
import { EndpointError, success } from "./http";
import { toConversationDTO, toMessageDTO, toRunDTO } from "./mappers";
import { redactText } from "./redaction";
import { AIRepository } from "./repository";
import { idempotencyKeyFor, readBody, withHandler } from "./request";

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
    if (!options.enabled)
      throw new EndpointError("AI_DISABLED", "AI feature is disabled.", 409);
    const user = await requireChatUser(req, options);
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
    const [detail, changes] = await Promise.all([
      new AIRepository(req.payload, req).getConversationDetail(id, user.id),
      new ChangeRepository(req.payload, req).listOwnedChanges(id, user.id),
    ]);
    const executionRepository = new ExecutionRepository(req.payload, req);
    const deploymentRepository = new DeploymentRepository(req.payload, req);
    const dto: ConversationDetailDTO = {
      changeRequests: await Promise.all(
        changes.map(({ acceptance, approval, change, previewAcceptance }) =>
          projectChangeRequest({
            acceptance,
            approval,
            change,
            deploymentRepository,
            executionRepository,
            options,
            previewAcceptance,
          }),
        ),
      ),
      conversation: toConversationDTO(detail.conversation),
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
    if (!options.enabled)
      throw new EndpointError("AI_DISABLED", "AI feature is disabled.", 409);
    const user = await requireChatUser(req, options);
    consumeRateLimit(user.id);
    const conversationID = parseIdentifier(
      req.routeParams?.id,
      "conversation id",
    );
    const idempotencyKey = idempotencyKeyFor(req);
    const input = parseCreateMessageInput(await readBody(req));
    const content = redactText(input.content);
    const repository = new AIRepository(req.payload, req);
    const detail = await repository.getConversationDetail(
      conversationID,
      user.id,
    );
    if (detail.conversation.status === "archived") {
      throw new EndpointError(
        "CONFLICT",
        "Archived conversations are read-only.",
        409,
      );
    }

    const existing = await repository.findRunByIdempotencyKey(
      conversationID,
      idempotencyKey,
    );
    if (existing) return success({ run: toRunDTO(existing) }, correlationID);

    const threadID = await repository.getLatestThreadID(conversationID);
    let run;
    try {
      run = await repository.createRun({
        conversationID,
        idempotencyKey,
        model: options.runtime.model,
        requestedBy: user.id,
        threadID,
      });
    } catch (error) {
      const concurrent = await repository.findRunByIdempotencyKey(
        conversationID,
        idempotencyKey,
      );
      if (concurrent)
        return success({ run: toRunDTO(concurrent) }, correlationID);
      throw error;
    }
    const runID = String(run.id);
    const message = await repository.createUserMessage({
      content,
      conversationID,
      idempotencyKey,
      runID,
    });
    await repository.touchConversation(conversationID);

    try {
      await getControlPlaneClient(options).startRun({
        model: options.runtime.model,
        prompt: content,
        runID,
        threadID,
      });
    } catch (error) {
      const event: AIStreamEvent = {
        createdAt: new Date().toISOString(),
        id: randomUUID(),
        payload: {
          message:
            error instanceof Error
              ? error.message
              : "AI control plane is unavailable.",
        },
        runID,
        sequence: 1,
        type: "run.failed",
        visibility: "user-visible",
      };
      await persistAndApplyEvent(repository, event);
    }

    return success(
      { message: toMessageDTO(message), run: toRunDTO(run) },
      correlationID,
      202,
    );
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
    await getControlPlaneClient(options).cancelRun(id);
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

    let status: RuntimeStatusDTO;
    if (!options.enabled) {
      status = {
        enabled: false,
        mode: options.runtime.mode,
        reason: "Feature flag REALIZE_AI_ENABLED is disabled.",
        state: "disabled",
      };
    } else if (await getControlPlaneClient(options).health()) {
      status = { enabled: true, mode: options.runtime.mode, state: "ready" };
    } else {
      status = {
        enabled: true,
        mode: options.runtime.mode,
        reason: "Configured control plane is unavailable.",
        state: "unavailable",
      };
    }
    return success(status, correlationID);
  });
};
