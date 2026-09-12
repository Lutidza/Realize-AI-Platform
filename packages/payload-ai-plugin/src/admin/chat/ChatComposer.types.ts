/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatComposer.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Выделяет данные и обработчики формы из состояния разговора.
 */

import type { ChatConversationViewProps } from "./ChatConversation.types";

export type ChatComposerProps = Pick<
  ChatConversationViewProps,
  | "controller"
  | "settings"
  | "bindInput"
  | "canSend"
  | "hintId"
  | "isBusy"
  | "submit"
  | "submitOnEnter"
>;
