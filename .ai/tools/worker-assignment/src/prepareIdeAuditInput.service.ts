/**
 * @file .ai/tools/worker-assignment/src/prepareIdeAuditInput.service.ts
 * @version 2.1.0
 * @date 2026-11-26
 * @description Материализует вход исполнителя и вычисляет квитанции из передаваемого текста.
 * @see documentation/specifications/internal-mcp.md
 */
import type { IdeAuditRange } from "realize-ai-platform/ide-assignment-queue";
import type { AssignmentBindResult } from "./WorkerAssignment.types";
import { hashAuditText } from "./checkpoints/hashAuditText.util";

export type AuditWindows = Record<
  string,
  [number, number] | [number, number][]
>;

type Context = Extract<AssignmentBindResult, { context: object }>["context"];

/** Преждевременный EOF, смена версии или пропуск страницы запрещают выдачу всего пакета. */
export async function prepareIdeAuditInput(
  context: Context,
  ranges: AuditWindows = {},
) {
  const maxInput = 384 * 1024;
  let bytes = Buffer.byteLength(context.initialInput);
  if (bytes > maxInput) throw new Error("assignment_input_limit");
  const sources = [];
  const receipts: IdeAuditRange[] = [];
  const named = Object.keys(ranges);
  const paths = named.length ? named : Object.keys(context.scopePins);
  for (const path of paths) {
    const selected = ranges[path];
    const windows: ([number, number] | undefined)[] = !selected
      ? [undefined]
      : Array.isArray(selected[0])
        ? (selected as [number, number][])
        : [selected as [number, number]];
    for (const range of windows) {
      const fileSha256 = context.readPins[path];
      if (!fileSha256)
        throw new Error(
          "assignment_read: путь вне закреплённой области " + path,
        );
      const startLine = range?.[0] ?? 1;
      let start = startLine;
      let totalLines: number | undefined;
      let endLine: number;
      let text = "";
      do {
        const page = await context.callTool("repo_read_file", {
          path,
          expectedSha256: fileSha256,
          startLine: start,
          lineCount: Math.max(
            1,
            Math.min(400, range ? range[1] - start + 1 : 400),
          ),
        });
        totalLines ??= page.totalLines;
        endLine = page.endLine;
        const target = range?.[1] ?? totalLines;
        const count = page.text.match(/[^\n]*\n|[^\n]+$/g)?.length ?? 0;
        if (
          page.path !== path ||
          page.version.sha256 !== fileSha256 ||
          page.startLine !== start ||
          page.totalLines !== totalLines ||
          target > totalLines ||
          endLine > target ||
          endLine !== start - 1 + count ||
          (!count && (totalLines !== 0 || start !== 1)) ||
          page.nextLine !== (endLine < totalLines ? endLine + 1 : null)
        )
          throw new Error(
            `assignment_read: разрыв или смена снимка ${path}:${start}–${target}`,
          );
        bytes += Buffer.byteLength(page.text);
        if (bytes > maxInput) throw new Error("assignment_input_limit");
        text += page.text;
        start = endLine + 1;
        if (endLine === target) break;
      } while (true);
      const receipt = {
        path,
        fileSha256,
        startLine,
        endLine,
        totalLines,
        byteLength: Buffer.byteLength(text),
        rangeSha256: hashAuditText(text),
      };
      receipts.push(receipt);
      sources.push({ ...receipt, sha256: fileSha256, text });
    }
  }
  return {
    input: JSON.stringify({
      ...JSON.parse(context.initialInput),
      reviewFiles: sources,
    }),
    receipts,
  };
}
