/**
 * @file packages/codex-adapter/src/collectCodexChatSources.mapper.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Извлекает безопасные ссылки только из структурированных источников Codex.
 */

import { parseChatSources, type ChatSourceDto } from "@realize/ai-contracts";
import { codexRecord } from "./codexRecord.util";

/** Не распознаёт URLs в тексте ответа и не превращает внутренние citation ID в ссылки. */
export const collectCodexChatSources = (
  items: unknown[],
  previous: ChatSourceDto[] = [],
): ChatSourceDto[] => {
  let sources = parseChatSources(previous);
  for (const value of items) {
    const item = codexRecord(value);
    if (item?.type === "webSearch") {
      if (Array.isArray(item.results))
        sources = parseChatSources([...sources, ...item.results]);
      const action = codexRecord(item.action);
      if (action?.type === "openPage" || action?.type === "findInPage")
        sources = parseChatSources([...sources, action]);
    }
    if (item?.type === "agentMessage" && Array.isArray(item.annotations)) {
      for (const annotation of item.annotations) {
        const entry = codexRecord(annotation);
        if (entry?.type === "url_citation")
          sources = parseChatSources([
            ...sources,
            codexRecord(entry.url_citation) ?? entry,
          ]);
      }
    }
  }
  return sources;
};
