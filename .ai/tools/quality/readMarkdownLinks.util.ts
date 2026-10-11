/**
 * @file .ai/tools/quality/readMarkdownLinks.util.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Извлекает локальные ссылки и GFM anchors из prose без примеров code fences.
 */
const prose = (text: string): string =>
  text
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "")
    .replace(/^---\r?\n[\s\S]*?\r?\n---/u, "");

export function readMarkdownLinks(text: string): string[] {
  const source = prose(text).replace(/`[^`\n]+`/g, "");
  return [
    ...[
      ...source.matchAll(
        /!?\[[^\]\n]*\]\((?:<([^>\n]+)>|([^\s]+?))(?:\s+"[^"]*")?\)/gu,
      ),
    ].map((x) => x[1] ?? x[2]),
    ...[...source.matchAll(/^\s*\[[^\]\n]+\]:\s*(?:<([^>\n]+)>|(\S+))/gm)].map(
      (x) => x[1] ?? x[2],
    ),
  ].filter((x) => !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(x));
}

/** Совпадающие заголовки получают суффиксы -1, -2; explicit HTML ids также доступны. */
export function readMarkdownAnchors(text: string): Set<string> {
  const source = prose(text);
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
