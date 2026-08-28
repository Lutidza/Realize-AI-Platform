/**
 * @file packages/payload-ai-plugin/src/admin/useRealizeAIChat.ts
 * @version 2026-08-28
 * @description Управляет bootstrap чата, durable state и governed change actions.
 */

"use client";

import type {
  ConversationDTO,
  ConversationDetailDTO,
  MessageDTO,
  RunDTO,
  RuntimeStatusDTO,
} from "@realize/ai-contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import type { RealizeAIController } from "./RealizeAIContext";
import { chatErrorMessage } from "./chatState";
import { requestRealizeAI } from "./realizeAIAPI";
import { isActiveRun } from "./runStreamTypes";
import { useChangeRequests } from "./useChangeRequests";
import { useDataOperations } from "./useDataOperations";
import { useExecutionPolling } from "./useExecutionPolling";
import { useRunStream } from "./useRunStream";
import { useSourcePromotion } from "./useSourcePromotion";

/** Builds one controller that survives navigation inside Payload Admin. */
export const useRealizeAIChat = (enabled: boolean): RealizeAIController => {
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [detail, setDetail] = useState<ConversationDetailDTO>();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [isPlanActionPending, setIsPlanActionPending] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeStatusDTO>();
  const [currentRun, setCurrentRun] = useState<RunDTO>();
  const [search, setSearch] = useState("");
  const [selectedConversationID, setSelectedConversationID] =
    useState<string>();
  const bootstrappedRef = useRef(false);
  const detailRef = useRef<ConversationDetailDTO | undefined>(undefined);
  const pendingConversationRef = useRef<Promise<ConversationDTO> | null>(null);
  const selectedIDRef = useRef<string | undefined>(undefined);

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
      selectedIDRef.current = id;
      setSelectedConversationID(id);
      detailRef.current = undefined;
      setDetail(undefined);
      setCurrentRun(undefined);
      const next = await requestRealizeAI<ConversationDetailDTO>(
        `/conversations/${id}`,
      );
      applyConversation(next, id);
    },
    [applyConversation],
  );

  useEffect(() => {
    if (!enabled || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    let isMounted = true;

    const bootstrap = async () => {
      const [status, list] = await Promise.all([
        requestRealizeAI<RuntimeStatusDTO>("/status"),
        requestRealizeAI<ConversationDTO[]>("/conversations"),
      ]);
      if (!isMounted) return;
      setRuntime(status);
      setConversations(list);
      if (list[0]) await openConversation(list[0].id);
    };

    void bootstrap().catch((cause: unknown) => {
      bootstrappedRef.current = false;
      if (isMounted) setError(chatErrorMessage(cause, "Ошибка загрузки."));
    });
    return () => {
      isMounted = false;
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
    run: currentRun,
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

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || currentRun || runtime?.state !== "ready") return;
    setError(undefined);
    setDraft("");
    setIsSubmitting(true);
    try {
      const conversation =
        detailRef.current?.conversation ||
        (await (pendingConversationRef.current ||
          createConversation(content.slice(0, 80))));
      const result = await requestRealizeAI<{
        message?: MessageDTO;
        run: RunDTO;
      }>(`/conversations/${conversation.id}/messages`, {
        body: JSON.stringify({ content }),
        headers: { "Idempotency-Key": crypto.randomUUID() },
        method: "POST",
      });
      if (result.message) {
        setDetail((current) => {
          if (!current || current.conversation.id !== conversation.id) {
            return current;
          }
          const next = {
            ...current,
            messages: [...current.messages, result.message as MessageDTO],
          };
          detailRef.current = next;
          return next;
        });
      }
      setCurrentRun(result.run);
    } catch (cause) {
      setDraft(content);
      setError(chatErrorMessage(cause, "Не удалось отправить сообщение."));
    } finally {
      setIsSubmitting(false);
    }
  }, [createConversation, currentRun, draft, runtime?.state]);

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
  useExecutionPolling({ detail, detailRef, setDetail, setError });

  return {
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
