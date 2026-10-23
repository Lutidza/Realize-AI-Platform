/**
 * @file packages/payload-ai-plugin/src/chat-context/continueWorkflow.service.ts
 * @version 1.2.0
 * @date 2026-10-23
 * @description Создаёт единственного потомка неизменяемого checkpoint с проверкой владельца и запроса.
 */
import type { ContinueWorkflowInput } from "@realize/ai-contracts";
import {
  hashCanonicalJSON,
  assertRuntimeAIConfiguration,
  requireSystemAIRelease,
  parseWorkflowCheckpoint,
  resumeWorkflowInput,
} from "@realize/change-engine";
import type { PayloadRequest } from "payload";
import { AIRepository, type AIDocument } from "../endpoints/repository";
import { EndpointError } from "../endpoints/http";
import { relationID, toMessageDTO, toRunDTO } from "../endpoints/mappers";
import { withPayloadTransaction } from "../endpoints/payloadTransaction";
import { lockAITransaction } from "../endpoints/lockAITransaction.util";
import { redactText } from "../endpoints/redaction";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import type { CreateChatMessageResult } from "./ChatAttachment.types";
import type { ChatRunContext } from "./ChatRunContext.types";
import { prepareWorkflowSegment } from "./prepareWorkflowSegment.service";
import { dispatchWorkflowSegment } from "./dispatchWorkflowSegment.service";
import { resolveOwnerEngineeringMetadata } from "./ownerEngineeringAdmission.service";

export const continueWorkflow = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
  userID: number | string,
  parentRunID: string,
  input: ContinueWorkflowInput,
): Promise<CreateChatMessageResult> => {
  const repository = new AIRepository(req.payload, req);
  const parent = await repository.getRun(parentRunID, userID);
  const conversationID = relationID(parent.conversation);
  const detail = await repository.getConversationDetail(conversationID, userID);
  if (detail.conversation.status === "archived")
    throw new EndpointError(
      "CONFLICT",
      "Архивный диалог доступен только для чтения.",
      409,
    );
  const context = parent.turnContext as ChatRunContext | undefined;
  if (
    !context?.workflow ||
    !context.agentConfiguration ||
    !["completed", "queued"].includes(String(parent.status))
  )
    throw new EndpointError(
      "CONFLICT",
      "Этот запуск не содержит завершённого сегмента процесса.",
      409,
    );
  const system = requireSystemAIRelease(context.systemRelease);
  const systemRelease = {
    releaseID: system.releaseID,
    manifestHash: system.manifestHash,
  };
  const agentConfiguration = assertRuntimeAIConfiguration(
    systemRelease,
    context.agentConfiguration,
  );
  if (!agentConfiguration)
    throw new EndpointError(
      "CONFLICT",
      "Workflow configuration is missing.",
      409,
    );
  const checkpoint = parseWorkflowCheckpoint(
    agentConfiguration,
    context.workflow,
  );
  if (
    checkpoint.version !== input.expectedVersion ||
    checkpoint.stepKey !== input.expectedStepKey
  )
    throw new EndpointError(
      "CONFLICT",
      "Состояние процесса изменилось. Обновите диалог; ваш ответ сохранён в форме.",
      409,
    );
  if (
    parent.status === "queued" &&
    checkpoint.phase === "running" &&
    input.content === undefined
  )
    return {
      run: toRunDTO(
        await dispatchWorkflowSegment(parent, options, req, userID),
      ),
    };
  if (
    parent.status !== "completed" ||
    !["ready", "awaiting_input"].includes(checkpoint.phase)
  )
    throw new EndpointError(
      "CONFLICT",
      "Этот сегмент ещё не готов к продолжению.",
      409,
    );
  if (
    checkpoint.phase === "ready"
      ? input.content !== undefined
      : !input.content?.trim()
  )
    throw new EndpointError(
      "INVALID_REQUEST",
      checkpoint.phase === "ready"
        ? "Этот шаг не ожидает нового сообщения."
        : "Введите ответ на вопрос процесса.",
      400,
    );
  const idempotencyKey = `workflow:child:${parentRunID}`;
  const requestHash = hashCanonicalJSON({ parentRunID, input });
  const replay = async (run: AIDocument): Promise<CreateChatMessageResult> => {
    const childContext = run.turnContext as ChatRunContext | undefined;
    if (
      run.requestHash !== requestHash ||
      childContext?.workflow?.parentRunID !== parentRunID
    )
      throw new EndpointError(
        "CONFLICT",
        "Этот шаг уже продолжен с другим ответом. Обновите диалог.",
        409,
      );
    const current = await dispatchWorkflowSegment(run, options, req, userID);
    return { run: toRunDTO(current) };
  };
  const existing = await repository.findRunByIdempotencyKey(
    conversationID,
    idempotencyKey,
  );
  if (existing) return await replay(existing);
  const ownerEngineering = await resolveOwnerEngineeringMetadata(
    req,
    options,
    agentConfiguration,
    userID,
  );
  const content =
    input.content === undefined ? undefined : redactText(input.content);
  const resumed =
    content === undefined
      ? checkpoint
      : resumeWorkflowInput(agentConfiguration, checkpoint, content);
  const nextContext: ChatRunContext = {
    ...context,
    ...(ownerEngineering ? { ownerEngineering } : {}),
    agentConfiguration,
    workflow: {
      ...resumed,
      parentRunID,
      rootRunID: checkpoint.rootRunID || parentRunID,
    },
  };
  let result: { run: AIDocument; message?: AIDocument };
  try {
    // Unique server key — durable claim. Никакой dispatch или preview до выигрыша insert.
    result = await withPayloadTransaction(req, async () => {
      await lockAITransaction(req, "workflow");
      const run = await repository.createRun({
        conversationID,
        idempotencyKey,
        model: typeof parent.model === "string" ? parent.model : undefined,
        requestedBy: userID,
        requestHash,
        turnContext: nextContext,
      });
      const message =
        content === undefined
          ? undefined
          : await repository.createUserMessage({
              content,
              conversationID,
              idempotencyKey,
              runID: String(run.id),
              turnContext: {
                attachments: [],
                projectFiles: [],
                webSearch: context.webSearch,
              },
            });
      const saved = await prepareWorkflowSegment({
        req,
        options,
        userID,
        conversationID,
        repository,
        run,
        context: nextContext,
      });
      await repository.touchConversation(conversationID);
      return { run: saved, message };
    });
  } catch (error) {
    const concurrent = await repository.findRunByIdempotencyKey(
      conversationID,
      idempotencyKey,
    );
    if (concurrent) return await replay(concurrent);
    throw error;
  }
  result.run = await dispatchWorkflowSegment(result.run, options, req, userID);
  return {
    ...(result.message ? { message: toMessageDTO(result.message) } : {}),
    run: toRunDTO(result.run),
  };
};
