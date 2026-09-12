/**
 * @file packages/payload-ai-plugin/src/chat-context/persistWorkflowAgentEvent.service.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Атомарно связывает terminal provider event с неизменяемым checkpoint сегмента.
 */
import type { AIStreamEvent } from "@realize/ai-contracts";
import {
  blockWorkflow,
  completeWorkflowStep,
  parseAIChatConfigurationSnapshot,
  parseWorkflowCheckpoint,
} from "@realize/change-engine";
import type { PayloadRequest } from "payload";
import { persistAndApplyEvent } from "../endpoints/eventPersistence";
import { lockAITransaction } from "../endpoints/lockAITransaction.util";
import { withPayloadTransaction } from "../endpoints/payloadTransaction";
import { AIRepository } from "../endpoints/repository";
import { redactText } from "../endpoints/redaction";
import type { ChatRunContext } from "./ChatRunContext.types";

/** Параллельные SSE readers не публикуют completed без checkpoint и не завершают шаг дважды. */
export const persistWorkflowAgentEvent = async (
  req: PayloadRequest,
  userID: string | number,
  event: AIStreamEvent,
): Promise<boolean> => {
  return await withPayloadTransaction(req, async () => {
    await lockAITransaction(req, "workflow");
    const repository = new AIRepository(req.payload, req);
    const run = await repository.getRun(event.runID, userID);
    if (
      ["completed", "failed", "cancelled"].includes(String(run.status)) ||
      Number(run.eventCursor || 0) >= event.sequence
    ) {
      if (await repository.findEventSequence(event.id, event.runID)) {
        await repository.persistEvent(event);
        return true;
      }
      return false;
    }
    if (
      event.type !== "assistant.completed" &&
      event.type !== "run.failed" &&
      event.type !== "run.cancelled"
    ) {
      await persistAndApplyEvent(repository, event);
      return true;
    }
    const context = run.turnContext as ChatRunContext;
    const configuration = parseAIChatConfigurationSnapshot(
      context.agentConfiguration,
    );
    const checkpoint = parseWorkflowCheckpoint(configuration, context.workflow);
    let next;
    if (event.type === "assistant.completed") {
      const content = redactText(String(event.payload.content || ""));
      try {
        next = completeWorkflowStep(configuration, checkpoint, {
          text: content,
        });
      } catch {
        next = blockWorkflow(
          configuration,
          checkpoint,
          "Результат шага не соответствует лимитам процесса.",
        );
      }
    } else {
      next = blockWorkflow(
        configuration,
        checkpoint,
        event.type === "run.cancelled"
          ? "Выполнение шага отменено."
          : redactText(
              String(
                event.payload.message || "Не удалось выполнить шаг процесса.",
              ),
            ).slice(0, 500),
      );
    }
    await persistAndApplyEvent(repository, event);
    await repository.updateRun(event.runID, {
      turnContext: { ...context, workflow: next },
    });
    return true;
  });
};
