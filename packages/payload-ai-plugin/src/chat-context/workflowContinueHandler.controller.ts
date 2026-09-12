/**
 * @file packages/payload-ai-plugin/src/chat-context/workflowContinueHandler.controller.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Авторизует явное продолжение процесса через общий runtime API envelope.
 */
import {
  parseContinueWorkflowInput,
  parseIdentifier,
} from "@realize/ai-contracts";
import { consumeRateLimit, requireChatUser } from "../endpoints/access";
import { EndpointError, success } from "../endpoints/http";
import { idempotencyKeyFor, readBody, withHandler } from "../endpoints/request";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { continueWorkflow } from "./continueWorkflow.service";

export const createWorkflowContinueHandler = (
  options: SanitizedRealizeAIPluginOptions,
) =>
  withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    if (!options.enabled)
      throw new EndpointError(
        "AI_DISABLED",
        options.runtimeStatus?.reason ?? "Административный агент выключен.",
        409,
      );
    consumeRateLimit(user.id);
    idempotencyKeyFor(req);
    const id = parseIdentifier(req.routeParams?.id, "run id");
    const input = parseContinueWorkflowInput(await readBody(req));
    return success(
      await continueWorkflow(req, options, user.id, id, input),
      correlationID,
      201,
    );
  });
