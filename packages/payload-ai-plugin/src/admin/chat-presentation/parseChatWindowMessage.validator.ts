/**
 * @file packages/payload-ai-plugin/src/admin/chat-presentation/parseChatWindowMessage.validator.ts
 * @version 1.3.0
 * @date 2026-09-11
 * @description Проверяет ограниченный межоконный протокол без произвольных URL и действий.
 */

import { parseChatWorkflowDraft } from "./parseChatWorkflowDraft.validator";
import { parseChatReadyContext } from "./parseChatReadyContext.validator";
import { parseAIChatConfigurationSelection } from "@realize/ai-contracts";

import type {
  ChatHandoffState,
  ChatWindowMessage,
} from "./ChatPresentation.types";

const recordOf = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const keysMatch = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const stateOf = (value: unknown): ChatHandoffState | undefined => {
  const state = recordOf(value);
  if (
    !state ||
    !keysMatch(state, [
      "conversationID",
      "draft",
      "context",
      "agentConfigurationSelection",
      "workflowDraft",
    ]) ||
    typeof state.draft !== "string" ||
    state.draft.length > 8_000 ||
    (state.conversationID !== undefined && !identifier(state.conversationID))
  )
    return undefined;
  const workflowDraft =
    state.workflowDraft === undefined
      ? undefined
      : parseChatWorkflowDraft(state.workflowDraft);
  if (state.workflowDraft !== undefined && !workflowDraft) return undefined;
  const context =
    state.context === undefined
      ? undefined
      : parseChatReadyContext(state.context);
  if (state.context !== undefined && !context) return undefined;
  let agentConfigurationSelection: ChatHandoffState["agentConfigurationSelection"];
  try {
    if (state.agentConfigurationSelection !== undefined)
      agentConfigurationSelection = parseAIChatConfigurationSelection(
        state.agentConfigurationSelection,
      );
  } catch {
    return undefined;
  }
  return {
    ...(workflowDraft ? { workflowDraft } : {}),
    ...(agentConfigurationSelection ? { agentConfigurationSelection } : {}),
    ...(context ? { context } : {}),
    draft: state.draft,
    ...(state.conversationID
      ? { conversationID: state.conversationID as string }
      : {}),
  };
};

/** Некорректные сообщения игнорируются до доступа к controller и маршрутизации. */
export const parseChatWindowMessage = (
  value: unknown,
): ChatWindowMessage | undefined => {
  const message = recordOf(value);
  if (!message) return undefined;
  if (message.type === "realize-chat-ready" && keysMatch(message, ["type"]))
    return { type: message.type };
  if (
    message.type === "realize-chat-returned" &&
    identifier(message.requestID) &&
    keysMatch(message, ["type", "requestID"])
  )
    return { type: message.type, requestID: message.requestID };
  const state = stateOf(message.state);
  if (!state) return undefined;
  if (
    message.type === "realize-chat-state" &&
    keysMatch(message, ["type", "state"])
  )
    return { type: message.type, state };
  if (
    message.type === "realize-chat-return" &&
    (message.mode === "panel" || message.mode === "page") &&
    identifier(message.requestID) &&
    keysMatch(message, ["type", "state", "mode", "requestID"])
  )
    return {
      type: message.type,
      state,
      mode: message.mode,
      requestID: message.requestID,
    };
  return undefined;
};
