/**
 * @file packages/payload-ai-plugin/src/chat-context/dispatchWorkflowSegment.service.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Повторяет точную отправку сохранённого шага модели без повторения серверных эффектов.
 */
import {
  parseAIChatConfigurationSnapshot,
  parseWorkflowCheckpoint,
} from "@realize/change-engine";
import { AIRepository, type AIDocument } from "../endpoints/repository";
import type { PayloadRequest } from "payload";
import { EndpointError } from "../endpoints/http";
import { getControlPlaneClient } from "../runtime/getControlPlaneClient";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import type { ChatRunContext } from "./ChatRunContext.types";

/** Run ID и весь transport остаются прежними при потере ответа / недоступном CP. */
export const dispatchWorkflowSegment = async (
  run: AIDocument,
  options: SanitizedRealizeAIPluginOptions,
  req: PayloadRequest,
  userID: number | string,
): Promise<AIDocument> => {
  const repository = new AIRepository(req.payload, req);
  const current = await repository.getRun(String(run.id), userID);
  if (current.status !== "queued") return current;
  const context = current.turnContext as ChatRunContext;
  const agentConfiguration = parseAIChatConfigurationSnapshot(
    context.agentConfiguration,
  );
  const workflow = parseWorkflowCheckpoint(
    agentConfiguration,
    context.workflow,
  );
  if (workflow.phase !== "running") return current;
  try {
    await getControlPlaneClient(options).startRun({
      runID: String(current.id),
      prompt: String(workflow.input.request),
      model: typeof current.model === "string" ? current.model : undefined,
      agentConfiguration,
      workflow,
      webSearch: context.webSearch,
      attachments: [],
      projectFiles: [],
    });
  } catch {
    const latest = await repository.getRun(String(current.id), userID);
    if (latest.status === "cancelled") return latest;
    throw new EndpointError(
      "AI_RUNTIME_UNAVAILABLE",
      "Шаг сохранён, но runtime пока недоступен. Повторите отправку: процесс продолжится с того же шага.",
      503,
    );
  }
  const latest = await repository.getRun(String(current.id), userID);
  if (latest.status === "cancelled")
    await getControlPlaneClient(options)
      .cancelRun(String(current.id))
      .catch(() => undefined);
  return latest;
};
