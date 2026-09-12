/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatPendingFiles.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет действия над файлами в черновике сообщения.
 */

import type { ChatDraftContextController } from "./ChatDraftContext.types";
export type ChatPendingFilesProps = {
  context: ChatDraftContextController;
  disabled: boolean;
};
