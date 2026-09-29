/**
 * @file services/ai-control-plane/src/mapRepositorySyntaxMatches.mapper.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Переводит UTF-16 parser в Unicode code points MCP, не меняя исходный текст.
 */
import type { SyntaxMatch } from "../../../.ai/tools/agent-search/src/SyntaxSearch.types.d.mts";
export function* mapRepositorySyntaxMatches(matches: Iterable<SyntaxMatch>) {
  for (const match of matches) {
    const column = [...match.lineText.slice(0, match.character)].length;
    const start = Math.max(0, column - 100);
    yield {
      line: match.line,
      column: column + 1,
      snippet: [...match.lineText].slice(start, start + 500).join(""),
      syntax: match.syntax,
    };
  }
}
