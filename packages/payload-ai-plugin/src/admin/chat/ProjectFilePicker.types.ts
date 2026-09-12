/**
 * @file packages/payload-ai-plugin/src/admin/chat/ProjectFilePicker.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет выбор файлов проекта в контекст сообщения.
 */

import type { ChatDraftContextController } from "./ChatDraftContext.types";
export type ProjectFilePickerProps = {
  context: ChatDraftContextController;
  disabled: boolean;
};
