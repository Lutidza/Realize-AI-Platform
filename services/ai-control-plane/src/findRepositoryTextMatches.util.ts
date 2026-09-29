/**
 * @file services/ai-control-plane/src/findRepositoryTextMatches.util.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Сохраняет literal Unicode matching и исходные code point координаты MCP.
 */
export function* findRepositoryTextMatches(
  text: string,
  input: { query: string; caseSensitive: boolean },
  assertActive: () => void,
) {
  const query = input.caseSensitive ? input.query : input.query.toLowerCase();
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index++) {
    assertActive();
    const points = [...lines[index]];
    const normalized: string[] = [];
    const columns: number[] = [];
    for (let column = 0; column < points.length; column++) {
      const point = input.caseSensitive
        ? points[column]
        : points[column].toLowerCase();
      normalized.push(point);
      for (let unit = 0; unit < point.length; unit++) columns.push(column);
    }
    const haystack = normalized.join("");
    for (
      let offset = haystack.indexOf(query);
      offset !== -1;
      offset = haystack.indexOf(query, offset + Math.max(1, query.length))
    ) {
      assertActive();
      const column = columns[offset];
      const snippetStart = Math.max(0, column - 100);
      yield {
        line: index + 1,
        column: column + 1,
        snippet: points.slice(snippetStart, snippetStart + 500).join(""),
      };
    }
  }
}
