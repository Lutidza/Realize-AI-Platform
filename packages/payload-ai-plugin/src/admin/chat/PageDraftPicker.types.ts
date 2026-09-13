/**
 * @file packages/payload-ai-plugin/src/admin/chat/PageDraftPicker.types.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Отделяет вход выбора CMS-страницы от состояния каталога и представления.
 */
import type { ChatDraftContextController } from "./ChatDraftContext.types";

export type PageDraftPickerProps = {
  context: ChatDraftContextController;
  disabled: boolean;
};
