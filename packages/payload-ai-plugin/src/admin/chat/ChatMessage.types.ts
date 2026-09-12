/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatMessage.types.ts
 * @version 1.2.0
 * @date 2026-09-11
 * @description Задаёт сообщение и связанные операции подтверждения без копирования DTO.
 */

import type {
  ChangeRequestDTO,
  CodexChatSettingsDto,
  ConversationDetailDTO,
  DataOperationDTO,
} from "@realize/ai-contracts";
import type { RealizeAIController } from "../RealizeAIContext";

export type ChatMessageProps = {
  message: ConversationDetailDTO["messages"][number];
  change?: ChangeRequestDTO;
  dataOperations?: DataOperationDTO[];
  controller: RealizeAIController;
  tools: CodexChatSettingsDto["tools"];
  canClarifyChange: boolean;
  clarificationBlocked: boolean;
  onClarifyChange: (messageID: string) => void;
};
