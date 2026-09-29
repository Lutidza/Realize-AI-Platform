/**
 * @file .ai/tools/agent-search/src/createSyntaxLocator.util.mjs
 * @version 1.0.0
 * @date 2026-09-28
 * @description Вычисляет LF-строки и UTF-16 offsets AST для дальнейшего перевода координат транспорта.
 */
export function createSyntaxLocator(text, source) {
  // TS дополнительно считает CR/U+2028/U+2029 переносами; CLI/MCP читают строки по LF.
  const lines = [0];
  for (
    let offset = text.indexOf("\n");
    offset !== -1;
    offset = text.indexOf("\n", offset + 1)
  )
    lines.push(offset + 1);
  return (node) => {
    const offset = node.getStart(source);
    let line = 0;
    let end = lines.length;
    while (line + 1 < end) {
      const middle = (line + end) >>> 1;
      if (lines[middle] <= offset) line = middle;
      else end = middle;
    }
    return {
      offset,
      line: line + 1,
      character: offset - lines[line],
      lineText: text
        .slice(lines[line], lines[line + 1] ?? text.length)
        .replace(/\r?\n$/u, ""),
    };
  };
}
