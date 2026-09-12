/**
 * @file packages/ai-contracts/src/parseChatSources.validator.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Нормализует только безопасные веб-источники, возвращённые провайдером.
 */
import type { ChatSourceDto } from "./ChatContext.types";
/** Принимает только безопасные HTTP(S) источники; старые записи дают пустой список. */
export const parseChatSources = (value: unknown): ChatSourceDto[] => {
  if (!Array.isArray(value)) return [];
  const result: ChatSourceDto[] = [];
  for (const entry of value.slice(0, 50)) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      typeof entry.url !== "string" ||
      entry.url.length > 2048 ||
      /[\x00-\x20\x7f]/.test(entry.url)
    )
      continue;
    try {
      const url = new URL(entry.url);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        result.some((source) => source.url === url.href)
      )
        continue;
      result.push({
        url: url.href,
        ...(typeof entry.title === "string"
          ? {
              title: entry.title
                .replace(/[\x00-\x1f\x7f]/g, "")
                .trim()
                .slice(0, 300),
            }
          : {}),
      });
    } catch {
      /* Некорректный источник не становится ссылкой в интерфейсе. */
    }
  }
  return result;
};
