/**
 * @file .ai/tools/worker-assignment/src/prepareIdeAuditInput.service.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Материализует один ограниченный снимок Assignment через его закреплённый reader.
 * @see .ai/tools/worker-assignment/README.md
 */
import type { AssignmentBindResult } from "./WorkerAssignment.types";

type Context = Extract<AssignmentBindResult, { context: object }>["context"];

/** За пределом бюджета возвращается blocker; частичные входы не отправляются как полный аудит. */
export async function prepareIdeAuditInput(
  context: Context,
  ranges: Record<string, [number, number]> = {},
) {
  const maxInput = 384 * 1024;
  let bytes = Buffer.byteLength(context.initialInput);
  if (bytes > maxInput) throw new Error("assignment_input_limit");
  const sources = [];
  for (const [path, sha256] of Object.entries(context.scopePins)) {
    const range = ranges[path];
    let start: number | null = range?.[0] ?? 1;
    let text = "";
    do {
      const page = await context.callTool("repo_read_file", {
        path,
        expectedSha256: sha256,
        startLine: start,
        lineCount: Math.min(400, range ? range[1] - start + 1 : 400),
      });
      bytes += Buffer.byteLength(page.text);
      if (bytes > maxInput) throw new Error("assignment_input_limit");
      text += page.text;
      start = range && page.endLine >= range[1] ? null : page.nextLine;
    } while (start !== null);
    sources.push({
      path,
      sha256,
      startLine: range?.[0] ?? 1,
      endLine: range?.[1],
      text,
    });
  }
  return JSON.stringify({
    ...JSON.parse(context.initialInput),
    reviewFiles: sources,
  });
}
