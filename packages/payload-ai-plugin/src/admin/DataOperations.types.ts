/**
 * @file packages/payload-ai-plugin/src/admin/DataOperations.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Описывает привязку общих DataOperation actions к conversation state чата.
 */

import type { ConversationDetailDTO } from "@realize/ai-contracts";
import type { Dispatch, SetStateAction } from "react";

export type UseDataOperationsOptions = {
  detailRef: { current: ConversationDetailDTO | undefined };
  setDetail: Dispatch<SetStateAction<ConversationDetailDTO | undefined>>;
  setError: Dispatch<SetStateAction<string | undefined>>;
  setPending: Dispatch<SetStateAction<string | undefined>>;
};
