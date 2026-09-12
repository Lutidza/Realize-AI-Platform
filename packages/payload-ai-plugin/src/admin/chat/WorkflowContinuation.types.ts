/**
 * @file packages/payload-ai-plugin/src/admin/chat/WorkflowContinuation.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Задаёт общий continuation port для чата и карточки процесса без привязки к модели чтения.
 */

import type { MessageDTO, RunDTO } from "@realize/ai-contracts";
import type { Dispatch, SetStateAction } from "react";

export type WorkflowContinuationResult = { run: RunDTO; message?: MessageDTO };

/** Неизвестный результат POST сохраняет точное тело и исходный checkpoint. */
export type WorkflowContinuationRequest = {
  run: RunDTO;
  conversationID: string;
  rootID: string;
  version: number;
  key: string;
  body: string;
  draft?: string;
};

export type WorkflowContinuationOptions = {
  run?: RunDTO;
  runs?: readonly RunDTO[];
  conversationID?: string;
  archived: boolean;
  enabled: boolean;
  ready: boolean;
  busy: boolean;
  draft: string;
  hasContext?: boolean;
  setDraft: Dispatch<SetStateAction<string>>;
  setError?: (message?: string) => void;
  acceptResult: (
    result: WorkflowContinuationResult,
    conversationID: string,
  ) => void;
  refresh: (run: RunDTO) => Promise<RunDTO | undefined>;
};

/** Локальное состояние запроса; durable identity и проверка полномочий остаются на сервере. */
export type WorkflowContinuationController = {
  run?: RunDTO;
  isPending: boolean;
  hasRetry: boolean;
  isRefreshing: boolean;
  isLocked: boolean;
  canContinue: boolean;
  error?: string;
  pendingConversationID?: string;
  clearError: () => void;
  continue: () => Promise<void>;
  refresh: () => Promise<void>;
};
