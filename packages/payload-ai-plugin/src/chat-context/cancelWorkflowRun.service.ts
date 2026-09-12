/**
 * @file packages/payload-ai-plugin/src/chat-context/cancelWorkflowRun.service.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Сохраняет отмену workflow-сегмента до попытки остановить недоступный runtime.
 */
import type { AIStreamEvent } from "@realize/ai-contracts";
import {
  blockWorkflow,
  parseAIChatConfigurationSnapshot,
  parseWorkflowCheckpoint,
} from "@realize/change-engine";
import type { PayloadRequest } from "payload";
import { persistAndApplyEvent } from "../endpoints/eventPersistence";
import { EndpointError } from "../endpoints/http";
import { lockAITransaction } from "../endpoints/lockAITransaction.util";
import { withPayloadTransaction } from "../endpoints/payloadTransaction";
import { AIRepository } from "../endpoints/repository";
import { getControlPlaneClient } from "../runtime/getControlPlaneClient";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import type { ChatRunContext } from "./ChatRunContext.types";

/** Cursor читается под общей блокировкой; CP 404/недоступность не откатывает durable cancellation. */
export const cancelWorkflowRun = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
  userID: number | string,
  runID: string,
): Promise<void> => {
  await withPayloadTransaction(req, async () => {
    await lockAITransaction(req, "workflow");
    const repository = new AIRepository(req.payload, req);
    const run = await repository.getRun(runID, userID);
    if (run.status === "cancelled") return;
    if (run.status !== "queued" && run.status !== "running")
      throw new EndpointError(
        "CONFLICT",
        "Этот запуск уже завершён и не может быть отменён.",
        409,
      );
    const context = run.turnContext as ChatRunContext;
    const configuration = parseAIChatConfigurationSnapshot(
      context?.agentConfiguration,
    );
    const checkpoint = parseWorkflowCheckpoint(
      configuration,
      context?.workflow,
    );
    const next = blockWorkflow(
      configuration,
      checkpoint,
      "Выполнение шага отменено.",
    );
    const event: AIStreamEvent = {
      id: `workflow:${runID}:cancelled`,
      runID,
      sequence: Number(run.eventCursor || 0) + 1,
      createdAt: new Date().toISOString(),
      type: "run.cancelled",
      visibility: "user-visible",
      payload: {},
    };
    await persistAndApplyEvent(repository, event);
    await repository.updateRun(runID, {
      turnContext: { ...context, workflow: next },
    });
  });
  try {
    await getControlPlaneClient(options).cancelRun(runID);
  } catch {
    // Отмена уже сохранена; исчезнувший или перезапускаемый CP не владеет её результатом.
  }
};
