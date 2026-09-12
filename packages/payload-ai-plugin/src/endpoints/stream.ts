/**
 * @file packages/payload-ai-plugin/src/endpoints/stream.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Передаёт SSE с durable replay и атомарным checkpoint workflow-сегмента.
 */

import { randomUUID } from "node:crypto";

import { encodeSSE, type AIStreamEvent } from "@realize/ai-contracts";
import type { PayloadHandler } from "payload";

import type { SanitizedRealizeAIPluginOptions } from "../types";
import { requireChatUser } from "./access";
import {
  parseControlPlaneEvent,
  persistAndApplyEvent,
} from "./eventPersistence";
import { correlationIDFor, failure } from "./http";
import { toStreamEvent } from "./mappers";
import { AIRepository } from "./repository";
import { getControlPlaneClient } from "../runtime/getControlPlaneClient";
import { persistWorkflowAgentEvent } from "../chat-context/persistWorkflowAgentEvent.service";
import { ControlPlaneUnavailableError } from "../runtime/ControlPlaneUnavailable.error";

const terminalTypes = new Set<AIStreamEvent["type"]>([
  "assistant.completed",
  "run.cancelled",
  "run.failed",
]);

const eventDataFromFrame = (frame: string): string | undefined => {
  const lines = frame.split("\n");
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  return data.length > 0 ? data.join("\n") : undefined;
};

export const createRunEventsHandler = (
  options: SanitizedRealizeAIPluginOptions,
): PayloadHandler => {
  return async (req) => {
    const correlationID = correlationIDFor(req);

    try {
      const user = await requireChatUser(req, options);
      const runID = String(req.routeParams?.id || "");
      const repository = new AIRepository(req.payload, req);
      const run = await repository.getRun(runID, user.id);
      const isWorkflow = !!(
        run.turnContext &&
        typeof run.turnContext === "object" &&
        "workflow" in run.turnContext &&
        run.turnContext.workflow
      );
      const persist = (event: AIStreamEvent) =>
        isWorkflow
          ? persistWorkflowAgentEvent(req, user.id, event)
          : persistAndApplyEvent(repository, event);
      const lastEventID = req.headers.get("last-event-id");
      let afterSequence = lastEventID
        ? await repository.findEventSequence(lastEventID, runID)
        : 0;
      const stored = (await repository.listEvents(runID, afterSequence)).map(
        toStreamEvent,
      );
      if (stored.length > 0)
        afterSequence = stored.at(-1)?.sequence || afterSequence;

      const encoder = new TextEncoder();
      const abortController = new AbortController();
      const stream = new ReadableStream<Uint8Array>({
        cancel: () => abortController.abort(),
        start: async (controller) => {
          const publish = async (event: AIStreamEvent): Promise<boolean> => {
            if ((await persist(event)) === false) {
              // Отмена могла победить provider event или локальный run.failed.
              for (const storedEvent of (
                await repository.listEvents(runID, afterSequence)
              ).map(toStreamEvent))
                controller.enqueue(encoder.encode(encodeSSE(storedEvent)));
              return false;
            }
            controller.enqueue(encoder.encode(encodeSSE(event)));
            return true;
          };
          try {
            for (const event of stored)
              controller.enqueue(encoder.encode(encodeSSE(event)));
            const currentStatus = String(run.status);
            if (["cancelled", "completed", "failed"].includes(currentStatus)) {
              controller.close();
              return;
            }

            // Переключатель запрещает новые dispatch, но уже принятый run сохраняет события и завершение.
            const response = await getControlPlaneClient(options).streamRun(
              runID,
              afterSequence,
              abortController.signal,
            );
            if (!response.body)
              throw new Error("Control plane returned an empty event stream.");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let terminalReceived = false;

            while (true) {
              const { done, value } = await reader.read();
              buffer += decoder
                .decode(value, { stream: !done })
                .replaceAll("\r\n", "\n");

              let boundary = buffer.indexOf("\n\n");
              while (boundary >= 0) {
                const frame = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                const data = eventDataFromFrame(frame);
                if (data) {
                  const event = parseControlPlaneEvent(
                    JSON.parse(data) as unknown,
                    runID,
                  );
                  if (event.sequence > afterSequence) {
                    if (!(await publish(event))) {
                      await reader.cancel();
                      controller.close();
                      return;
                    }
                    afterSequence = event.sequence;
                    terminalReceived = terminalTypes.has(event.type);
                  }
                }
                boundary = buffer.indexOf("\n\n");
              }
              if (done) break;
            }

            if (!terminalReceived && !abortController.signal.aborted) {
              const event: AIStreamEvent = {
                createdAt: new Date().toISOString(),
                id: randomUUID(),
                payload: {
                  message: "Control-plane stream ended before run completion.",
                },
                runID,
                sequence: afterSequence + 1,
                type: "run.failed",
                visibility: "user-visible",
              };
              await publish(event);
            }
            controller.close();
          } catch (error) {
            if (abortController.signal.aborted) return;
            if (
              isWorkflow &&
              run.status === "running" &&
              error instanceof ControlPlaneUnavailableError &&
              error.status === 404
            ) {
              const event: AIStreamEvent = {
                id: `workflow:${runID}:runtime-lost`,
                runID,
                sequence: afterSequence + 1,
                createdAt: new Date().toISOString(),
                type: "run.failed",
                visibility: "user-visible",
                payload: {
                  message:
                    "Runtime перезапущен и потерял незавершённый ответ модели. Процесс остановлен; сохранённые результаты и подготовленные изменения доступны в диалоге.",
                },
              };
              await publish(event);
              controller.close();
              return;
            }
            req.payload.logger.error({
              correlationID,
              err: error,
              msg: "AI SSE bridge failed.",
            });
            controller.error(error);
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream; charset=utf-8",
          "X-Accel-Buffering": "no",
          "X-Correlation-ID": correlationID,
        },
      });
    } catch (error) {
      return failure(error, correlationID, req.payload.logger);
    }
  };
};
