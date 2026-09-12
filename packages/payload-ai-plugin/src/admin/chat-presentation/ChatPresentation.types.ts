/**
 * @file packages/payload-ai-plugin/src/admin/chat-presentation/ChatPresentation.types.ts
 * @version 1.3.0
 * @date 2026-09-11
 * @description Задаёт размещение чата и ограниченный обмен состоянием между окнами.
 */

import type {
  CodexChatSettingsDto,
  AIChatConfigurationSelection,
} from "@realize/ai-contracts";
import type { ChatReadyContext } from "../chat/ChatDraftContext.types";
import type { ChatWorkflowDraft } from "../chat/ChatWorkflow.types";
import type { ReactNode } from "react";

export type ChatDisplayMode = CodexChatSettingsDto["displayMode"];
export type RealizeAIProviderProps = {
  children?: ReactNode;
  route: `/${string}`;
  integrationsRoute?: `/${string}`;
};
export type RealizeAIClientProps = { presentation?: "page" | "window" };

/** Передаёт только черновик и готовые ссылки, без File и содержимого документов. */
export type ChatHandoffState = {
  agentConfigurationSelection?: AIChatConfigurationSelection;
  workflowDraft?: ChatWorkflowDraft;
  conversationID?: string;
  draft: string;
  context?: ChatReadyContext;
};
export type ChatWindowMessage =
  | { type: "realize-chat-ready" }
  | { type: "realize-chat-state"; state: ChatHandoffState }
  | {
      type: "realize-chat-return";
      state: ChatHandoffState;
      mode: "panel" | "page";
      requestID: string;
    }
  | { type: "realize-chat-returned"; requestID: string };

export type ChatWindowOptions = {
  isWindow: boolean;
  windowURL: string;
  readState: () => ChatHandoffState;
  receiveState: (state: ChatHandoffState) => Promise<void>;
  openHere: (mode: "panel" | "page") => void;
  onError: (message: string) => void;
};

/** Единый API launcher, навигации и внутреннего workspace. */
export type ChatPresentationController = {
  settings?: CodexChatSettingsDto;
  isLoading: boolean;
  error?: string;
  notice?: string;
  panelOpen: boolean;
  isPage: boolean;
  isWindow: boolean;
  isSettings: boolean;
  openChat: (mode?: ChatDisplayMode) => void;
  closeChat: () => void;
  openSettings: () => void;
  refreshSettings: () => Promise<void>;
  clearNotice: () => void;
};
