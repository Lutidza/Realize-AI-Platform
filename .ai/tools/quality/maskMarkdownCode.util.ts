/**
 * @file .ai/tools/quality/maskMarkdownCode.util.ts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Скрывает Markdown code и frontmatter, сохраняя исходные UTF-16 offsets ссылок и заголовков.
 * @see documentation/architecture/repository-search.md
 */
/** Маска сохраняет offsets UTF-16 исходного текста; fenced/inline code не является consumer. */
export function maskMarkdownCode(source: string, inline = true): string {
  const chars = source.split("");
  const mask = (start: number, end: number) => {
    for (let i = start; i < end; i++)
      if (chars[i] !== "\n" && chars[i] !== "\r") chars[i] = " ";
  };
  const frontmatter = source.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  if (frontmatter) mask(0, frontmatter[0].length);
  let fence: { marker: string; size: number } | null = null;
  for (const line of source.matchAll(/[^\n]*(?:\n|$)/g)) {
    if (!line[0]) continue;
    const open = line[0].match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      mask(line.index, line.index + line[0].length);
      if (
        open &&
        open[1][0] === fence.marker &&
        open[1].length >= fence.size &&
        !line[0].slice(open[0].length).trim()
      )
        fence = null;
    } else if (open) {
      fence = { marker: open[1][0], size: open[1].length };
      mask(line.index, line.index + line[0].length);
    } else if (/^(?: {4}|\t)/.test(line[0]))
      mask(line.index, line.index + line[0].length);
  }
  let text = chars.join("");
  if (!inline) return text;
  for (const match of text.matchAll(/`+/g)) {
    if (
      chars[match.index] !== "`" ||
      (match.index > 0 && text[match.index - 1] === "\\")
    )
      continue;
    const size = match[0].length;
    let end = match.index + size;
    while ((end = text.indexOf("`".repeat(size), end)) >= 0) {
      if (text[end - 1] !== "`" && text[end + size] !== "`") break;
      end += size;
    }
    if (end >= 0) mask(match.index, end + size);
  }
  text = chars.join("");
  return text;
}
