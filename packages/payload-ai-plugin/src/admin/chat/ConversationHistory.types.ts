/**
 * @file packages/payload-ai-plugin/src/admin/chat/ConversationHistory.types.ts
 * @version 1.2.0
 * @date 2026-09-11
 * @description Определяет поиск, выбор и подтверждаемое архивирование разговоров.
 */

import type { ConversationDTO } from "@realize/ai-contracts";
export type ConversationHistoryProps = {
  conversations: ConversationDTO[];
  id: string;
  onClose: () => void;
  onOpen: (id: string) => void;
  onStart: () => void;
  onArchive: (id: string) => Promise<void>;
  onSearchChange: (value: string) => void;
  search: string;
  selectedId?: string;
  busy: boolean;
  canStart?: boolean;
};
