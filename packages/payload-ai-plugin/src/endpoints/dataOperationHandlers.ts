/**
 * @file packages/payload-ai-plugin/src/endpoints/dataOperationHandlers.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Обрабатывает управляемые операции данных с отдельными подтверждениями и откатом.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import {
  parseApplyDataOperationInput,
  parseCreateDataOperationInput,
  parseDataRollbackInput,
  parseDecideDataOperationInput,
  parseIdentifier,
} from "@realize/ai-contracts";
import type { PayloadHandler as PayloadEndpointHandler } from "payload";

import { requireCodexChatTool } from "./requireCodexChatTool.service";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import {
  consumeRateLimit,
  requireChatUser,
  requireDataManager,
} from "./access";
import {
  approveDataOperationRollback,
  decideDataOperation,
} from "./dataOperationDecisions";
import { applyDataOperation } from "./dataOperationExecution";
import { createDataOperationPlan } from "./dataOperationPlanning";
import { projectDataOperation } from "./dataOperationProjection";
import { DataOperationRepository } from "./dataOperationRepository";
import { rollbackDataOperation } from "./dataOperationRollback";
import { success } from "./http";
import { idempotencyKeyFor, readBody, withHandler } from "./request";

/** Creates all HTTP boundaries of the first typed Payload data lane. */
export const createDataOperationHandlers = (
  options: SanitizedRealizeAIPluginOptions,
): {
  apply: PayloadEndpointHandler;
  approve: PayloadEndpointHandler;
  approveRollback: PayloadEndpointHandler;
  create: PayloadEndpointHandler;
  detail: PayloadEndpointHandler;
  reject: PayloadEndpointHandler;
  rollback: PayloadEndpointHandler;
} => ({
  apply: withHandler(async (req, correlationID) => {
    const user = await requireDataManager(req, options);
    await requireCodexChatTool(req, "dataOperations", options);
    consumeRateLimit(user.id);
    const dataOperationID = parseIdentifier(
      req.routeParams?.id,
      "data operation id",
    );
    idempotencyKeyFor(req);
    const operation = await applyDataOperation({
      data: parseApplyDataOperationInput(await readBody(req)),
      dataOperationID,
      payload: req.payload,
      req,
      userID: user.id,
    });
    return success(
      await projectDataOperation({ operation, payload: req.payload, req }),
      correlationID,
    );
  }),

  approve: withHandler(async (req, correlationID) => {
    const user = await requireDataManager(req, options);
    await requireCodexChatTool(req, "dataOperations", options);
    consumeRateLimit(user.id);
    const dataOperationID = parseIdentifier(
      req.routeParams?.id,
      "data operation id",
    );
    const operation = await decideDataOperation({
      data: parseDecideDataOperationInput(await readBody(req)),
      dataOperationID,
      decision: "approved",
      idempotencyKey: idempotencyKeyFor(req),
      payload: req.payload,
      req,
      user,
    });
    return success(
      await projectDataOperation({ operation, payload: req.payload, req }),
      correlationID,
    );
  }),

  approveRollback: withHandler(async (req, correlationID) => {
    const user = await requireDataManager(req, options);
    consumeRateLimit(user.id);
    const dataOperationID = parseIdentifier(
      req.routeParams?.id,
      "data operation id",
    );
    const data = parseDataRollbackInput(await readBody(req));
    const operation = await approveDataOperationRollback({
      comment: data.comment,
      dataOperationID,
      expectedRollbackHash: data.expectedRollbackHash,
      expectedVersion: data.expectedVersion,
      idempotencyKey: idempotencyKeyFor(req),
      payload: req.payload,
      req,
      user,
    });
    return success(
      await projectDataOperation({ operation, payload: req.payload, req }),
      correlationID,
    );
  }),

  create: withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    await requireCodexChatTool(req, "dataOperations", options);
    consumeRateLimit(user.id);
    const conversationID = parseIdentifier(
      req.routeParams?.id,
      "conversation id",
    );
    const data = parseCreateDataOperationInput(await readBody(req));
    const operation = await createDataOperationPlan({
      conversationID,
      idempotencyKey: idempotencyKeyFor(req),
      payload: req.payload,
      req,
      sourceMessageID: data.sourceMessageID,
      userID: user.id,
    });
    return success(
      await projectDataOperation({ operation, payload: req.payload, req }),
      correlationID,
      201,
    );
  }),

  detail: withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    const dataOperationID = parseIdentifier(
      req.routeParams?.id,
      "data operation id",
    );
    const operation = await new DataOperationRepository(
      req.payload,
      req,
    ).getOwnedOperation(dataOperationID, user.id);
    return success(
      await projectDataOperation({ operation, payload: req.payload, req }),
      correlationID,
    );
  }),

  reject: withHandler(async (req, correlationID) => {
    const user = await requireDataManager(req, options);
    consumeRateLimit(user.id);
    const dataOperationID = parseIdentifier(
      req.routeParams?.id,
      "data operation id",
    );
    const operation = await decideDataOperation({
      data: parseDecideDataOperationInput(await readBody(req), true),
      dataOperationID,
      decision: "rejected",
      idempotencyKey: idempotencyKeyFor(req),
      payload: req.payload,
      req,
      user,
    });
    return success(
      await projectDataOperation({ operation, payload: req.payload, req }),
      correlationID,
    );
  }),

  rollback: withHandler(async (req, correlationID) => {
    const user = await requireDataManager(req, options);
    consumeRateLimit(user.id);
    const dataOperationID = parseIdentifier(
      req.routeParams?.id,
      "data operation id",
    );
    const data = parseDataRollbackInput(await readBody(req));
    idempotencyKeyFor(req);
    const operation = await rollbackDataOperation({
      dataOperationID,
      expectedRollbackHash: data.expectedRollbackHash,
      expectedVersion: data.expectedVersion,
      payload: req.payload,
      req,
      userID: user.id,
    });
    return success(
      await projectDataOperation({ operation, payload: req.payload, req }),
      correlationID,
    );
  }),
});
