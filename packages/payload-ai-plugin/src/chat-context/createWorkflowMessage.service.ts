/**
 * @file packages/payload-ai-plugin/src/chat-context/createWorkflowMessage.service.ts
 * @version 1.2.0
 * @date 2026-09-30
 * @description Создаёт первый сегмент процесса и его исходное сообщение в одной транзакции.
 */
import type { CreateMessageInput } from "@realize/ai-contracts";
import {
  AIConfigurationPolicyError,
  hashCanonicalJSON,
  initializeWorkflow,
} from "@realize/change-engine";
import type { PayloadRequest } from "payload";
import { AIRepository, type AIDocument } from "../endpoints/repository";
import { EndpointError } from "../endpoints/http";
import { toMessageDTO, toRunDTO } from "../endpoints/mappers";
import { withPayloadTransaction } from "../endpoints/payloadTransaction";
import { lockAITransaction } from "../endpoints/lockAITransaction.util";
import { redactText } from "../endpoints/redaction";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import type { CreateChatMessageResult } from "./ChatAttachment.types";
import type { ChatRunContext } from "./ChatRunContext.types";
import { resolveAIChatConfiguration } from "./resolveAIChatConfiguration.service";
import { prepareWorkflowSegment } from "./prepareWorkflowSegment.service";
import { dispatchWorkflowSegment } from "./dispatchWorkflowSegment.service";

export const createWorkflowMessage = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
  userID: number | string,
  conversationID: string,
  idempotencyKey: string,
  input: CreateMessageInput,
): Promise<CreateChatMessageResult> => {
  if (!input.workflow) throw new Error("Workflow selection is required.");
  if (
    input.attachmentIDs?.length ||
    input.projectFiles?.length ||
    input.pageDraft
  )
    throw new EndpointError(
      "INVALID_REQUEST",
      "Для запуска процесса уберите вложения, файлы проекта и выбранную страницу. Входные данные процесса задаются отдельно.",
      400,
    );
  const repository = new AIRepository(req.payload, req);
  const detail = await repository.getConversationDetail(conversationID, userID);
  if (detail.conversation.status === "archived")
    throw new EndpointError(
      "CONFLICT",
      "Архивный диалог доступен только для чтения.",
      409,
    );
  const requestHash = hashCanonicalJSON({ kind: "workflow_start", input });
  const replay = async (run: AIDocument): Promise<CreateChatMessageResult> => {
    if (run.requestHash !== requestHash)
      throw new EndpointError(
        "CONFLICT",
        "Ключ отправки уже связан с другим запросом процесса.",
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
  const content = redactText(input.content);
  const agentConfiguration = await resolveAIChatConfiguration(
    req,
    input.agentConfiguration,
    content,
  );
  if (!agentConfiguration)
    throw new EndpointError(
      "CONFLICT",
      "Для процесса выберите профиль активного выпуска.",
      409,
    );
  const workflow = (() => {
    try {
      return initializeWorkflow(
        agentConfiguration,
        input.workflow.key,
        content,
        input.workflow.input,
      );
    } catch (error) {
      if (error instanceof AIConfigurationPolicyError)
        throw new EndpointError("INVALID_REQUEST", error.message, 400);
      throw error;
    }
  })();
  const context: ChatRunContext = {
    repositoryAccess: {
      developerInstructions: Boolean(
        await options.access.canManageAIConfiguration({ req }),
      ),
    },
    attachments: [],
    projectFiles: [],
    webSearch: input.webSearch ?? false,
    agentConfiguration,
    workflow,
    runtimeContextHash: hashCanonicalJSON({
      configuration: agentConfiguration.compiled.compiledContextHash,
      workflow: workflow.workflowKey,
      policy: "workflow-segment-1.0",
    }),
  };
  let result: { run: AIDocument; message: AIDocument };
  try {
    result = await withPayloadTransaction(req, async () => {
      await lockAITransaction(req, "workflow");
      const run = await repository.createRun({
        conversationID,
        idempotencyKey,
        model: options.runtime.model,
        requestedBy: userID,
        requestHash,
        turnContext: context,
      });
      const message = await repository.createUserMessage({
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
        context: {
          ...context,
          workflowSourceMessageID: String(message.id),
          workflow: { ...workflow, rootRunID: String(run.id) },
        },
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
  return { message: toMessageDTO(result.message), run: toRunDTO(result.run) };
};
