/**
 * @file packages/payload-ai-plugin/src/chat-context/buildChatConversationHistory.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Переносит ограниченную историю как данные при смене контекста модели.
 */
import type { AIDocument } from "../endpoints/repository";

/** Старые developer instructions не переносятся; используются только сохранённые реплики. */
export const buildChatConversationHistory = (
  messages: readonly AIDocument[],
): string | undefined => {
  const selected: Array<{ role: string; content: string }> = [];
  let truncated = false;
  for (const item of [...messages].reverse()) {
    if (
      (item.role !== "user" && item.role !== "assistant") ||
      typeof item.content !== "string"
    )
      continue;
    const entry = { role: item.role, content: item.content };
    if (
      Buffer.byteLength(
        JSON.stringify({ messages: [entry, ...selected], truncated: true }),
        "utf8",
      ) >
      32 * 1024
    ) {
      truncated = true;
      if (!selected.length) {
        entry.content = entry.content.slice(-8000);
        while (
          Buffer.byteLength(
            JSON.stringify({ messages: [entry], truncated: true }),
            "utf8",
          ) >
          32 * 1024
        )
          entry.content = entry.content.slice(
            Math.ceil(entry.content.length / 2),
          );
        selected.push(entry);
      }
      break;
    }
    selected.unshift(entry);
  }
  return selected.length
    ? JSON.stringify({ messages: selected, truncated })
    : undefined;
};
