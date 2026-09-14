/**
 * @file packages/payload-ai-plugin/src/chat-context/createChatMessage.service.ts
 * @version 1.6.0
 * @date 2026-09-13
 * @description Связывает полный запрос сообщения с владельцем, неизменяемыми файлами и одним run.
 */
import { createHash, randomUUID } from "node:crypto";
import { CHAT_ATTACHMENT_LIMITS } from "@realize/ai-contracts";
import { buildChatDeveloperInstructions } from "@realize/change-engine";
import type {
  CreateMessageInput,
  AIStreamEvent,
  RunDTO,
} from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import { EndpointError } from "../endpoints/http";
import { AIRepository } from "../endpoints/repository";
import type { AIDocument } from "../endpoints/repository";
import { redactText } from "../endpoints/redaction";
import { persistAndApplyEvent } from "../endpoints/eventPersistence";
import { toMessageDTO, toRunDTO } from "../endpoints/mappers";
import { getControlPlaneClient } from "../runtime/getControlPlaneClient";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { resolveOwnedChatAttachment } from "./resolveOwnedChatAttachment.service";
import { ChatAttachmentRepository } from "./ChatAttachment.repository";
import { toChatAttachmentDto } from "./chatAttachment.mapper";
import { resolveAIChatConfiguration } from "./resolveAIChatConfiguration.service";
import { buildChatConversationHistory } from "./buildChatConversationHistory.util";
import { createWorkflowMessage } from "./createWorkflowMessage.service";
import { PageDraftUpdate } from "../endpoints/pageDraftUpdate.service";
import { requireDataManager } from "../endpoints/access";
import { createPageDiscoveryGrant } from "./pageDiscoveryGrant.service";
import type { ChatRunContext } from "./ChatRunContext.types";
import type {
  ChatMessageContext,
  CreateChatMessageResult,
} from "./ChatAttachment.types";

/** Вход уже проверен HTTP boundary; секреты не сохраняются в тексте или снимке контекста. */
export const createChatMessage = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
  userID: number | string,
  conversationID: string,
  idempotencyKey: string,
  input: CreateMessageInput,
): Promise<CreateChatMessageResult> => {
  if (input.workflow)
    return await createWorkflowMessage(
      req,
      options,
      userID,
      conversationID,
      idempotencyKey,
      input,
    );
  const repository = new AIRepository(req.payload, req);
  const detail = await repository.getConversationDetail(conversationID, userID);
  if (detail.conversation.status === "archived")
    throw new EndpointError(
      "CONFLICT",
      "Архивный диалог доступен только для чтения.",
      409,
    );
  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        content: input.content,
        attachmentIDs: input.attachmentIDs ?? [],
        projectFiles: input.projectFiles ?? [],
        webSearch: input.webSearch ?? false,
        ...(input.pageDraft ? { pageDraft: input.pageDraft } : {}),
        ...(input.agentConfiguration
          ? { agentConfiguration: input.agentConfiguration }
          : {}),
      }),
    )
    .digest("hex");
  const replay = (existing: AIDocument): { run: RunDTO } => {
    const legacyMatch =
      !existing.requestHash &&
      !input.attachmentIDs?.length &&
      !input.projectFiles?.length &&
      !input.webSearch &&
      !input.agentConfiguration &&
      !input.pageDraft &&
      detail.messages.some(
        (message) =>
          String(message.runID) === String(existing.id) &&
          message.content === redactText(input.content),
      );
    if (existing.requestHash !== requestHash && !legacyMatch)
      throw new EndpointError(
        "CONFLICT",
        "Этот ключ отправки уже использован с другим содержимым. Повторите отправку с новым ключом.",
        409,
      );
    return { run: toRunDTO(existing) };
  };
  const existing = await repository.findRunByIdempotencyKey(
    conversationID,
    idempotencyKey,
  );
  if (existing) return replay(existing);
  const pageDiscoveryEnabled = Boolean(
    options.enabled &&
    options.pageDraft?.text &&
    (await options.access.canManageData({ req })),
  );
  if (input.pageDraft) await requireDataManager(req, options);
  const pageDraftContext = input.pageDraft
    ? await new PageDraftUpdate(req.payload, req).readContext(
        input.pageDraft.id,
      )
    : undefined;
  if (
    pageDraftContext &&
    pageDraftContext.fingerprint !== input.pageDraft?.fingerprint
  )
    throw new EndpointError(
      "CONFLICT",
      "Выбранная страница изменилась. Выберите её заново; текст сообщения сохранён.",
      409,
    );
  const agentConfiguration = await resolveAIChatConfiguration(
    req,
    input.agentConfiguration,
    input.content,
  );
  const client = getControlPlaneClient(options);
  const attachmentRepository = new ChatAttachmentRepository(req);
  const attachments = await Promise.all(
    (input.attachmentIDs ?? []).map((id) =>
      resolveOwnedChatAttachment(req, client, id, userID),
    ),
  );
  if (attachments.some((file) => file.runID))
    throw new EndpointError(
      "CONFLICT",
      "Вложение уже отправлено. Загрузите файл заново для нового сообщения.",
      409,
    );
  if (
    attachments.reduce((sum, file) => sum + file.size, 0) >
    CHAT_ATTACHMENT_LIMITS.maxTotalBytes
  )
    throw new EndpointError(
      "INVALID_REQUEST",
      "Общий размер вложений должен быть не больше 20 МиБ.",
      400,
    );
  let projectFiles: ChatMessageContext["projectFiles"] = [];
  if (input.projectFiles?.length) {
    try {
      projectFiles = await client.resolveProjectFiles(input.projectFiles);
    } catch {
      throw new EndpointError(
        "CONFLICT",
        "Выбранный файл изменился или недоступен. Выберите его снова.",
        409,
      );
    }
  }
  const context: ChatMessageContext = {
    ...(pageDraftContext ? { pageDraft: pageDraftContext.page } : {}),
    attachments: attachments.map(toChatAttachmentDto),
    projectFiles,
    webSearch: input.webSearch ?? false,
  };
  const runtimeContextHash = createHash("sha256")
    .update(
      JSON.stringify({
        configuration: agentConfiguration?.compiled.compiledContextHash ?? null,
        model: options.runtime.model ?? null,
        developerInstructions: buildChatDeveloperInstructions(input.webSearch),
        contextPolicyVersion: "1.4",
        pageDiscoveryVersion: pageDiscoveryEnabled ? "1.1" : null,
        pageDraftFingerprint: pageDraftContext?.fingerprint ?? null,
        ...(pageDraftContext?.knowledge
          ? {
              pageKnowledgeHash: createHash("sha256")
                .update(JSON.stringify(pageDraftContext.knowledge))
                .digest("hex"),
            }
          : {}),
      }),
    )
    .digest("hex");
  // Codex thread/resume не переопределяет dynamicTools; каждый discovery run получает новый thread.
  const threadID = pageDiscoveryEnabled
    ? undefined
    : await repository.getLatestThreadID(conversationID, runtimeContextHash);
  const conversationHistory = threadID
    ? undefined
    : buildChatConversationHistory(detail.messages);
  const runContext: ChatRunContext = {
    ...context,
    pageDraftContext,
    pageDiscoveryEnabled,
    agentConfiguration,
    runtimeContextHash,
    conversationHistory,
  };
  let run: AIDocument;
  try {
    run = await repository.createRun({
      conversationID,
      idempotencyKey,
      model: options.runtime.model,
      requestedBy: userID,
      threadID,
      requestHash,
      turnContext: runContext,
    });
  } catch (error) {
    const concurrent = await repository.findRunByIdempotencyKey(
      conversationID,
      idempotencyKey,
    );
    if (concurrent) return replay(concurrent);
    throw error;
  }
  const runID = String(run.id);
  const content = redactText(input.content);
  let message: AIDocument | undefined;
  try {
    message = await repository.createUserMessage({
      content,
      conversationID,
      idempotencyKey,
      runID,
      turnContext: context,
    });
    // Только сохранённое сообщение может удерживать claim после сбоя БД или запуска.
    for (const attachment of attachments) {
      await client.claimChatAsset(
        { id: attachment.assetID, sha256: attachment.sha256 },
        runID,
      );
      await attachmentRepository.link(attachment, runID);
    }
    await repository.touchConversation(conversationID);
    await client.startRun({
      model: options.runtime.model,
      prompt: content,
      runID,
      threadID,
      attachments: attachments.map((file) => ({
        id: file.assetID,
        sha256: file.sha256,
      })),
      projectFiles: input.projectFiles,
      webSearch: input.webSearch,
      agentConfiguration,
      conversationHistory,
      pageDraftContext,
      ...(pageDiscoveryEnabled
        ? {
            pageDiscovery: createPageDiscoveryGrant(
              req.payload,
              options,
              runID,
              String(userID),
            ),
          }
        : {}),
    });
  } catch {
    const event: AIStreamEvent = {
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      payload: {
        message:
          "Не удалось передать сообщение в AI runtime. Проверьте доступность сервиса и вложений.",
      },
      runID,
      sequence: 1,
      type: "run.failed",
      visibility: "user-visible",
    };
    await persistAndApplyEvent(repository, event);
    run = {
      ...run,
      status: "failed",
      errorSummary: String(event.payload.message),
    };
  }
  return {
    ...(message ? { message: toMessageDTO(message) } : {}),
    run: toRunDTO(run),
  };
};
