/**
 * @file services/ai-control-plane/src/model-providers/openaiChatCompletions.policy.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Регистрирует проверенную область инструментов одного профиля OpenAI Chat Completions.
 * @see documentation/architecture/assignment-adapter/openai-chat-completions.md
 */
export const openAiChatPolicy = Object.freeze({
  id: "openai.chat-completions.explicit-functions-only",
  revision: 1,
  providerId: "openai",
  adapterId: "openai-chat-completions",
  method: "POST",
  endpoint: "https://api.openai.com/v1/chat/completions",
  model: "gpt-5.4-mini-2026-03-17",
  toolPolicy: "explicit-functions-only",
  sources: Object.freeze([
    "https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create",
    "https://developers.openai.com/api/docs/guides/function-calling",
    "https://developers.openai.com/api/docs/models/gpt-5.4-mini",
  ]),
} as const);

/** Политика применима только к зарегистрированному получателю. Форму тела отдельно сверяет V1. */
export function resolveOpenAiChatPolicy(request: {
  providerId: string;
  method: string;
  endpoint: string;
  model: string;
}) {
  return request.providerId === openAiChatPolicy.providerId &&
    request.method === openAiChatPolicy.method &&
    request.endpoint === openAiChatPolicy.endpoint &&
    request.model === openAiChatPolicy.model
    ? openAiChatPolicy
    : null;
}
