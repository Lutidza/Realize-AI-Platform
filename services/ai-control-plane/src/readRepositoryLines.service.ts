/**
 * @file services/ai-control-plane/src/readRepositoryLines.service.ts
 * @version 1.1.0
 * @date 2026-09-30
 * @description Читает полные строки исходного UTF-8 с hash всего файла и сохранением CRLF.
 */
import type { McpToolInput } from "../../../packages/ai-contracts/src/McpTool.types";
import type { RepositoryQueryContext } from "./RepositoryQueries.types";
import { RepositoryReadError } from "./RepositoryRead.error";
import { readRepositoryFile } from "./readRepositoryFile.service";

export async function readRepositoryLines(
  context: RepositoryQueryContext,
  input: McpToolInput<"repo_read_file">,
) {
  const file = await readRepositoryFile(context.policy, input.path, {
    signal: context.signal,
  });
  if (context.searchMetrics) {
    context.searchMetrics.filesRead = 1;
    context.searchMetrics.bytesRead = file.bytes.length;
    context.searchMetrics.candidateFiles = 1;
    context.searchMetrics.firstMatchMs =
      performance.now() - context.searchMetrics.started;
  }
  if (input.expectedSha256 && input.expectedSha256 !== file.sha256)
    throw new RepositoryReadError("CONFLICT", "Содержимое файла изменилось.");
  const lines = file.text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  if (input.startLine > Math.max(1, lines.length))
    throw new RepositoryReadError(
      "INVALID_INPUT",
      "Начальная строка находится за концом файла.",
    );
  let text = "";
  let count = 0;
  let reason: "response_bytes" | "page_limit" | null = null;
  for (const line of lines.slice(
    input.startLine - 1,
    input.startLine - 1 + input.lineCount,
  )) {
    if (
      Buffer.byteLength(JSON.stringify(text + line)) >
      (context.responseBytes ?? 131072) - 4096
    ) {
      reason = "response_bytes";
      break;
    }
    text += line;
    count++;
  }
  if (lines.length && !count)
    throw new RepositoryReadError(
      "RESULT_LIMIT",
      "Строка превышает размер ответа.",
    );
  const endLine = input.startLine - 1 + count;
  const nextLine = endLine < lines.length ? endLine + 1 : null;
  return {
    path: input.path,
    text,
    startLine: input.startLine,
    endLine,
    totalLines: lines.length,
    nextLine,
    truncated: nextLine !== null,
    truncationReason: nextLine ? (reason ?? "page_limit") : null,
    version: {
      source: "working_tree" as const,
      sha256: file.sha256,
      byteLength: file.bytes.length,
    },
  };
}
