/**
 * @file packages/payload-ai-plugin/src/admin/useExecutionPolling.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Определяет состояние диалога для фонового чтения этапов выполнения.
 */

import type { ConversationDetailDTO } from "@realize/ai-contracts";
import type { Dispatch, SetStateAction } from "react";

/** Ref разделяется с SSE и действиями диалога, чтобы отбрасывать устаревший ответ polling. */
export type ExecutionPollingOptions = {
  detail?: ConversationDetailDTO;
  detailRef: { current: ConversationDetailDTO | undefined };
  setDetail: Dispatch<SetStateAction<ConversationDetailDTO | undefined>>;
  setError: Dispatch<SetStateAction<string | undefined>>;
};
