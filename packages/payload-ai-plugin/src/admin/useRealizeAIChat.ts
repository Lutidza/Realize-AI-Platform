/**
 * @file packages/payload-ai-plugin/src/admin/useRealizeAIChat.ts
 * @version 1.4.0
 * @date 2026-09-11
 * @description Управляет bootstrap чата, durable state и governed change actions.
 */

"use client";

import type {
  ConversationDTO,
  ConversationDetailDTO,
  RunDTO,
} from "@realize/ai-contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import type { RealizeAIController } from "./RealizeAIController.types";
import { useAdminAgentRuntime } from "./chat/useAdminAgentRuntime.hook";
import { useChatDraftContext } from "./chat/useChatDraftContext.hook";
import { useChatWorkflow } from "./chat/useChatWorkflow.hook";
import { RealizeAIRequestError } from "./RealizeAIRequest.error";
import type {
  ChatWorkflowStartRequest,
  ChatWorkflowResult,
} from "./chat/ChatWorkflow.types";
import { useChatAgentConfiguration } from "./chat/useChatAgentConfiguration.hook";
import { chatErrorMessage } from "./chatState";
import { requestRealizeAI } from "./realizeAIAPI";
import { isActiveRun } from "./runStreamTypes";
import { useChangeRequests } from "./useChangeRequests";
import { useDataOperations } from "./useDataOperations";
import { useExecutionPolling } from "./useExecutionPolling";
import { useRunStream } from "./useRunStream";
import { useSourcePromotion } from "./useSourcePromotion";

/** Сохраняет черновик и контекст при навигации внутри Payload Admin. */
export const useRealizeAIChat = (enabled: boolean): RealizeAIController => {
  const context = useChatDraftContext(enabled);
  const agentConfiguration = useChatAgentConfiguration(enabled);
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [detail, setDetail] = useState<ConversationDetailDTO>();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [isPlanActionPending, setIsPlanActionPending] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingWorkflowConversationID, setPendingWorkflowConversationID] =
    useState<string>();
  const pendingWorkflowStartRef = useRef<ChatWorkflowStartRequest | undefined>(
    undefined,
  );
  const sendingRef = useRef(false);
  const runtime = useAdminAgentRuntime(enabled);
  const [currentRun, setCurrentRun] = useState<RunDTO>();
  const [search, setSearch] = useState("");
  const [selectedConversationID, setSelectedConversationID] =
    useState<string>();
  const bootstrappedRef = useRef(false);
  const detailRef = useRef<ConversationDetailDTO | undefined>(undefined);
  const pendingConversationRef = useRef<Promise<ConversationDTO> | null>(null);
  const selectedIDRef = useRef<string | undefined>(undefined);
  const conversationRequestRef = useRef(0);
  const selectionTouchedRef = useRef(false);

  const loadConversations = useCallback(async (): Promise<
    ConversationDTO[]
  > => {
    const list = await requestRealizeAI<ConversationDTO[]>("/conversations");
    setConversations(list);
    return list;
  }, []);

  const applyConversation = useCallback(
    (next: ConversationDetailDTO, expectedID: string) => {
      if (selectedIDRef.current !== expectedID) return false;
      detailRef.current = next;
      setDetail(next);
      setCurrentRun(next.runs.find(isActiveRun));
      return true;
    },
    [],
  );

  const openConversation = useCallback(
    async (id: string) => {
      const requestVersion = ++conversationRequestRef.current;
      selectionTouchedRef.current = true;
      selectedIDRef.current = id;
      setSelectedConversationID(id);
      detailRef.current = undefined;
      setDetail(undefined);
      setCurrentRun(undefined);
      const next = await requestRealizeAI<ConversationDetailDTO>(
        `/conversations/${id}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (conversationRequestRef.current === requestVersion)
        applyConversation(next, id);
    },
    [applyConversation],
  );

  const clearConversationSelection = useCallback(() => {
    selectionTouchedRef.current = true;
    conversationRequestRef.current += 1;
    selectedIDRef.current = undefined;
    setSelectedConversationID(undefined);
    detailRef.current = undefined;
    setDetail(undefined);
    setCurrentRun(undefined);
  }, []);

  useEffect(() => {
    if (!enabled || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    let isMounted = true;
    const request = new AbortController();

    const bootstrap = async () => {
      const list = await requestRealizeAI<ConversationDTO[]>("/conversations", {
        signal: request.signal,
      });
      if (!isMounted) return;
      setConversations(list);
      // Выбор пользователя или handoff имеет приоритет над первым элементом истории.
      const selectedID = selectedIDRef.current;
      const conversationID =
        selectedID ||
        (!selectionTouchedRef.current
          ? list.find((item) => item.status !== "archived")?.id
          : undefined);
      if (conversationID) await openConversation(conversationID);
    };

    void bootstrap().catch((cause: unknown) => {
      bootstrappedRef.current = false;
      if (isMounted) setError(chatErrorMessage(cause, "Ошибка загрузки."));
    });
    return () => {
      isMounted = false;
      request.abort();
      // Strict Mode remount и повторное открытие surface должны запустить bootstrap заново.
      bootstrappedRef.current = false;
    };
  }, [enabled, openConversation]);

  const synchronizeTerminalRun = useCallback(
    async (terminalRun: RunDTO) => {
      if (terminalRun.status === "failed") {
        setError(terminalRun.errorSummary || "Запуск завершился с ошибкой.");
      }
      const selectedID = selectedIDRef.current;
      if (!selectedID || selectedID !== terminalRun.conversationID) return;
      const [next] = await Promise.all([
        requestRealizeAI<ConversationDetailDTO>(`/conversations/${selectedID}`),
        loadConversations(),
      ]);
      applyConversation(next, selectedID);
    },
    [applyConversation, loadConversations],
  );

  const updateCurrentRun = useCallback((nextRun: RunDTO) => {
    if (selectedIDRef.current === nextRun.conversationID) {
      setCurrentRun(nextRun);
    }
  }, []);

  const stream = useRunStream({
    onRunUpdate: updateCurrentRun,
    onTerminal: synchronizeTerminalRun,
    run: enabled ? currentRun : undefined,
  });

  const createConversation = useCallback(
    async (title?: string): Promise<ConversationDTO> => {
      const conversation = await requestRealizeAI<ConversationDTO>(
        "/conversations",
        {
          body: JSON.stringify(title ? { title } : {}),
          headers: { "Idempotency-Key": crypto.randomUUID() },
          method: "POST",
        },
      );
      await loadConversations();
      await openConversation(conversation.id);
      return conversation;
    },
    [loadConversations, openConversation],
  );

  const startConversation = useCallback(async () => {
    selectedIDRef.current = undefined;
    setSelectedConversationID(undefined);
    detailRef.current = undefined;
    setDetail(undefined);
    setCurrentRun(undefined);
    setIsCreatingConversation(true);
    const pending = createConversation();
    pendingConversationRef.current = pending;
    try {
      setError(undefined);
      await pending;
    } catch (cause) {
      setError(chatErrorMessage(cause, "Не удалось создать диалог."));
    } finally {
      if (pendingConversationRef.current === pending) {
        pendingConversationRef.current = null;
      }
      setIsCreatingConversation(false);
    }
  }, [createConversation]);

  const acceptMessageResult = useCallback(
    (result: ChatWorkflowResult, conversationID: string) => {
      if (selectedIDRef.current !== conversationID) return;
      setDetail((current) => {
        if (!current || current.conversation.id !== conversationID)
          return current;
        const next = {
          ...current,
          messages:
            result.message &&
            !current.messages.some(
              (message) => message.id === result.message?.id,
            )
              ? [...current.messages, result.message]
              : current.messages,
          runs: [
            result.run,
            ...current.runs.filter((run) => run.id !== result.run.id),
          ],
        };
        detailRef.current = next;
        return next;
      });
      setCurrentRun(isActiveRun(result.run) ? result.run : undefined);
    },
    [],
  );
  const refreshWorkflowConversation = useCallback(
    async (id: string) => {
      const next = await requestRealizeAI<ConversationDetailDTO>(
        `/conversations/${encodeURIComponent(id)}`,
        { cache: "no-store", signal: AbortSignal.timeout(15_000) },
      );
      applyConversation(next, id);
      return next;
    },
    [applyConversation],
  );
  const workflow = useChatWorkflow({
    configuration: agentConfiguration,
    detail,
    currentRun,
    enabled,
    ready: runtime?.state === "ready",
    busy:
      isSubmitting ||
      isCreatingConversation ||
      Boolean(pendingWorkflowConversationID),
    draft,
    hasContext:
      context.attachments.length > 0 ||
      context.projectFiles.length > 0 ||
      context.webSearch,
    setDraft,
    setError,
    acceptResult: acceptMessageResult,
    refreshConversation: refreshWorkflowConversation,
  });

  const send = useCallback(async () => {
    const pending = pendingWorkflowStartRef.current;
    if (workflow.isReplying && !pending) {
      await workflow.continue();
      return;
    }
    const content = draft.trim();
    const snapshot = context.readReadyContext();
    const configurationSelection = agentConfiguration.selection;
    if (
      currentRun ||
      isSubmitting ||
      sendingRef.current ||
      workflow.isPending ||
      !enabled ||
      detailRef.current?.conversation.status === "archived" ||
      runtime?.state !== "ready"
    )
      return;
    if (
      pending
        ? selectedIDRef.current !== pending.conversationID
        : (!content &&
            !snapshot.attachments.length &&
            !snapshot.projectFiles.length) ||
          !workflow.isSelectionReady ||
          context.hasPendingAttachments ||
          context.hasFailedAttachments ||
          !agentConfiguration.isReady
    )
      return;
    setError(undefined);
    setIsSubmitting(true);
    sendingRef.current = true;
    try {
      const workflowInput = pending ? undefined : workflow.readStart();
      if (
        workflowInput &&
        (snapshot.attachments.length || snapshot.projectFiles.length)
      )
        throw new Error(
          "Для запуска процесса удалите выбранные вложения и файлы проекта. Входные данные можно передать в JSON.",
        );
      const conversation =
        detailRef.current?.conversation ||
        (await (pendingConversationRef.current ||
          createConversation(content.slice(0, 80))));
      const request: ChatWorkflowStartRequest = pending ?? {
        conversationID: conversation.id,
        body: JSON.stringify({
          content,
          attachmentIDs: snapshot.attachments.map((file) => file.id),
          projectFiles: snapshot.projectFiles.map(({ path, sha256 }) => ({
            path,
            sha256,
          })),
          webSearch: snapshot.webSearch,
          ...(workflowInput ? { workflow: workflowInput } : {}),
          ...(configurationSelection
            ? { agentConfiguration: configurationSelection }
            : {}),
        }),
        key: crypto.randomUUID(),
        draft,
        snapshot,
      };
      const isWorkflowStart = Boolean(pending || workflowInput);
      if (isWorkflowStart) pendingWorkflowStartRef.current = request;
      const result = await requestRealizeAI<ChatWorkflowResult>(
        `/conversations/${encodeURIComponent(request.conversationID)}/messages`,
        {
          body: request.body,
          headers: { "Idempotency-Key": request.key },
          method: "POST",
          ...(isWorkflowStart ? { signal: AbortSignal.timeout(15_000) } : {}),
        },
      );
      acceptMessageResult(result, request.conversationID);
      pendingWorkflowStartRef.current = undefined;
      setPendingWorkflowConversationID(undefined);
      if (isWorkflowStart) workflow.clearSentSelection();
      setDraft((value) => (value === request.draft ? "" : value));
      context.clearSentContext(request.snapshot);
      if (isWorkflowStart)
        await refreshWorkflowConversation(request.conversationID);
    } catch (cause) {
      if (
        cause instanceof RealizeAIRequestError &&
        cause.status !== undefined &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 429
      )
        pendingWorkflowStartRef.current = undefined;
      setPendingWorkflowConversationID(
        pendingWorkflowStartRef.current?.conversationID,
      );
      setError(chatErrorMessage(cause, "Не удалось отправить сообщение."));
    } finally {
      sendingRef.current = false;
      setIsSubmitting(false);
    }
  }, [
    context,
    agentConfiguration,
    createConversation,
    currentRun,
    draft,
    isSubmitting,
    runtime?.state,
    workflow,
    enabled,
    acceptMessageResult,
    refreshWorkflowConversation,
  ]);

  const archiveConversation = useCallback(
    async (id: string) => {
      await requestRealizeAI(
        `/conversations/${encodeURIComponent(id)}/archive`,
        {
          method: "POST",
          body: "{}",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        },
      );
      if (selectedIDRef.current === id) clearConversationSelection();
      await loadConversations();
    },
    [clearConversationSelection, loadConversations],
  );

  const cancel = useCallback(async () => {
    if (!isActiveRun(currentRun)) return;
    try {
      await requestRealizeAI(`/runs/${currentRun.id}/cancel`, {
        body: "{}",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        method: "POST",
      });
    } catch (cause) {
      setError(chatErrorMessage(cause, "Не удалось остановить запуск."));
    }
  }, [currentRun]);
  const {
    createChangeRequest,
    decideChangeRequest,
    decideImplementation,
    decidePreview,
    decideRelease,
    deployPreview,
    executeChangeRequest,
    prepareRelease,
  } = useChangeRequests({
    detailRef,
    isPlanActionPending,
    setDetail,
    setError,
    setIsPlanActionPending,
  });
  const {
    applyDataOperation,
    approveDataRollback,
    createDataOperation,
    decideDataOperation,
    rollbackDataOperation,
  } = useDataOperations({
    detailRef,
    setDetail,
    setError,
    setPending: setIsPlanActionPending,
  });
  const publishPullRequest = useSourcePromotion({
    detailRef,
    setDetail,
    setError,
    setPending: setIsPlanActionPending,
  });
  useExecutionPolling({
    detail: enabled ? detail : undefined,
    detailRef,
    setDetail,
    setError,
  });

  return {
    context,
    agentConfiguration,
    workflow,
    archiveConversation,
    clearConversationSelection,
    applyDataOperation,
    approveDataRollback,
    cancel,
    clearError: () => setError(undefined),
    conversations,
    createChangeRequest,
    createDataOperation,
    currentRun,
    decideChangeRequest,
    decideDataOperation,
    decideImplementation,
    decidePreview,
    decideRelease,
    detail,
    draft,
    error,
    isCreatingConversation,
    isPlanActionPending,
    isSubmitting,
    pendingWorkflowConversationID,
    executeChangeRequest,
    deployPreview,
    prepareRelease,
    publishPullRequest,
    rollbackDataOperation,
    openConversation,
    ready: runtime?.state === "ready",
    runtime,
    search,
    selectedConversationID,
    send,
    setDraft,
    setSearch,
    startConversation,
    stream,
  };
};
