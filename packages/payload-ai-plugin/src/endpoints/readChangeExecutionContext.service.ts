/**
 * @file packages/payload-ai-plugin/src/endpoints/readChangeExecutionContext.service.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Берёт policy плана только из завершённого run того же владельца и диалога.
 */
import type { PayloadRequest } from "payload";
import {
  createAIExecutionContext,
  hashCanonicalJSON,
  requireSystemAIRelease,
} from "@realize/change-engine";
import { AIRepository, type AIDocument } from "./repository";
import { relationID } from "./mappers";
import { EndpointError } from "./http";
import type { ChatRunContext } from "../chat-context/ChatRunContext.types";

export const readChangeExecutionContext = async (
  req: PayloadRequest,
  source: AIDocument,
  conversationID: string,
  userID: number | string,
  originalRequest: string,
) => {
  if (typeof source.runID !== "string" || !source.runID)
    throw new EndpointError(
      "CONFLICT",
      "План не связан с исходным AI run. Подготовьте новый план.",
      409,
    );
  const run = await new AIRepository(req.payload, req).getRun(
    source.runID,
    userID,
  );
  if (
    relationID(run.conversation) !== conversationID ||
    run.status !== "completed"
  )
    throw new EndpointError(
      "CONFLICT",
      "План требует завершённый run этого диалога.",
      409,
    );
  const context = run.turnContext as ChatRunContext | undefined;
  try {
    const system = requireSystemAIRelease(context?.systemRelease);
    return createAIExecutionContext({
      systemRelease: {
        releaseID: system.releaseID,
        manifestHash: system.manifestHash,
      },
      ...(context?.agentConfiguration
        ? { agentConfiguration: context.agentConfiguration }
        : {}),
      sourceRunID: String(run.id),
      originalRequestHash: hashCanonicalJSON(originalRequest),
      inputContextHash: hashCanonicalJSON({
        requestHash: run.requestHash ?? null,
        turnContext: context,
      }),
    });
  } catch {
    throw new EndpointError(
      "CONFLICT",
      "Исходный системный/админский снимок недоступен или несовместим. Подготовьте новый план.",
      409,
    );
  }
};
