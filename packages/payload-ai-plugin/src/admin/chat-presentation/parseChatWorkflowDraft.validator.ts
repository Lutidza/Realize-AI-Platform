/**
 * @file packages/payload-ai-plugin/src/admin/chat-presentation/parseChatWorkflowDraft.validator.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет перенос выбора процесса и сырого JSON без подмены его профиля.
 */

import {
  parseAIChatConfigurationSelection,
  parseWorkflowStartInput,
} from "@realize/ai-contracts";
import type { ChatWorkflowDraft } from "../chat/ChatWorkflow.types";

/** JSON остаётся текстом, чтобы незавершённый ввод не исчезал при смене окна. */
export const parseChatWorkflowDraft = (
  value: unknown,
): ChatWorkflowDraft | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !["key", "inputText", "profile"].includes(key),
    ) ||
    typeof input.key !== "string" ||
    typeof input.inputText !== "string" ||
    input.inputText.length > 131072
  )
    return;
  try {
    const profile =
      input.profile === undefined
        ? undefined
        : parseAIChatConfigurationSelection(input.profile);
    if (input.key) {
      parseWorkflowStartInput({ key: input.key });
      if (!profile) return;
    }
    return {
      key: input.key,
      inputText: input.inputText,
      ...(profile ? { profile } : {}),
    };
  } catch {
    return;
  }
};
