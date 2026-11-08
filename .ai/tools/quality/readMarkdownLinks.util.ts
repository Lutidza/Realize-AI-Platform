/**
 * @file .ai/tools/quality/readMarkdownLinks.util.ts
 * @version 1.1.0
 * @date 2026-10-29
 * @description Извлекает локальные ссылки и GFM anchors из prose без примеров code fences.
 */
import { maskMarkdownCode } from "./maskMarkdownCode.util.ts";
import type { MarkdownLinkSpan } from "./MarkdownReference.types.ts";

/** Один extractor для проверки и изменения: offsets указывают на исходный target без скобок. */
export function readMarkdownLinkSpans(text: string): MarkdownLinkSpan[] {
  const source = maskMarkdownCode(text);
  const result: MarkdownLinkSpan[] = [];
  const patterns = [
    /(!?\[[^\]\n]*\]\()(?:<([^>\n]+)>|([^\s]+?))(?:\s+"[^"]*")?\)/gu,
    /^(\s*\[[^\]\n]+\]:\s*)(?:<([^>\n]+)>|(\S+))/gm,
  ];
  for (const pattern of patterns)
    for (const match of source.matchAll(pattern)) {
      const group = match[2] === undefined ? 3 : 2;
      const target = match[group];
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) continue;
      // Prefix даёт точный offset даже при повторении target в label;
      // отсутствие флага /d сохраняет совместимость с target приложения до ES2022.
      const start = match.index + match[1].length + (group === 2 ? 1 : 0);
      const end = start + target.length;
      result.push({ target, start, end });
    }
  return result;
}

export function readMarkdownLinks(text: string): string[] {
  return readMarkdownLinkSpans(text).map(({ target }) => target);
}

/** Совпадающие заголовки получают суффиксы -1, -2; explicit HTML ids также доступны. */
export function readMarkdownAnchors(text: string): Set<string> {
  const source = maskMarkdownCode(text, false);
  const result = new Set<string>();
  for (const match of source.matchAll(
    /<(?:a|h[1-6])\b[^>]*\b(?:id|name)=["']([^"']+)["']/gi,
  ))
    result.add(match[1]);
  for (const match of source.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = match[1]
      .toLowerCase()
      .replace(/<[^>]+>/g, "")
      .replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, "")
      .replace(/\s/g, "-");
    let id = base;
    for (let suffix = 1; result.has(id); suffix++) id = `${base}-${suffix}`;
    result.add(id);
  }
  return result;
}
