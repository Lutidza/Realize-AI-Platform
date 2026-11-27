/**
 * @file .ai/tools/worker-assignment/src/auditRanges.service.ts
 * @version 1.1.0
 * @date 2026-11-26
 * @description Планирует диапазоны снимка и сверяет сохранённую доставку перед сводкой.
 * @see documentation/specifications/internal-mcp.md
 */
import type {
  IdeAuditDelivery,
  IdeAuditRange,
} from "realize-ai-platform/ide-assignment-queue";
import { hashAuditText } from "./checkpoints/hashAuditText.util";

/** Не делит строку, сохраняет BOM, CRLF и отсутствие завершающего перевода строки. */
export function planAuditRanges(
  path: string,
  text: string,
  fileSha256: string,
  budget: number,
) {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const ranges: IdeAuditRange[] = [];
  let startLine = 1;
  let byteLength = 0;
  function finish(endLine: number) {
    const part = lines.slice(startLine - 1, endLine).join("");
    ranges.push({
      path,
      fileSha256,
      startLine,
      endLine,
      totalLines: lines.length,
      byteLength,
      rangeSha256: hashAuditText(part),
    });
    startLine = endLine + 1;
    byteLength = 0;
  }
  for (const [index, line] of lines.entries()) {
    const size = Buffer.byteLength(line);
    if (size > budget)
      throw new Error(
        `assignment_read: ${path}:${index + 1} RESULT_LIMIT, размер строки ${size}`,
      );
    if (byteLength + size > budget) finish(index);
    byteLength += size;
  }
  finish(lines.length);
  return ranges;
}

/** Учитывает только точную доставку владельцу диапазона. Разбиение покрывает файл от 1 до EOF. */
export function verifyAuditDeliveries(
  plan: IdeAuditDelivery[],
  deliveries: IdeAuditDelivery[],
  extent: "whole-file" | "search-windows" = "whole-file",
) {
  const errors: string[] = [];
  const planned = new Map<string, IdeAuditRange>();
  const key = (id: string, range: IdeAuditRange) =>
    JSON.stringify([id, range.path, range.startLine]);
  const byPath = new Map<string, IdeAuditRange[]>();
  const files = new Map<string, IdeAuditRange>();
  for (const { assignmentId, ranges } of plan) {
    for (const range of ranges) {
      if (planned.has(key(assignmentId, range)))
        errors.push(
          "Повтор в плане " +
            assignmentId +
            " " +
            range.path +
            ":" +
            range.startLine,
        );
      planned.set(key(assignmentId, range), range);
      files.set(range.path, range);
    }
  }
  let verifiedRanges = 0;
  for (const { assignmentId, ranges } of deliveries) {
    for (const range of ranges) {
      const id = key(assignmentId, range);
      const expected = planned.get(id);
      const label = `${assignmentId} ${range.path}:${range.startLine}–${range.endLine}`;
      if (!expected) {
        errors.push("Лишний или повторный диапазон " + label);
        continue;
      }
      planned.delete(id);
      if (
        range.endLine !== expected.endLine ||
        range.totalLines !== expected.totalLines ||
        range.fileSha256 !== expected.fileSha256 ||
        range.rangeSha256 !== expected.rangeSha256 ||
        range.byteLength !== expected.byteLength
      ) {
        errors.push("Расхождение с закреплённым снимком " + label);
        continue;
      }
      const parts = byPath.get(range.path) ?? [];
      parts.push(range);
      byPath.set(range.path, parts);
      verifiedRanges++;
    }
  }
  for (const range of planned.values())
    errors.push(
      `Нет квитанции ${range.path}:${range.startLine}–${range.endLine}`,
    );
  // Между окнами разных совпадений могут находиться строки вне предмета уточнения.
  if (extent === "search-windows")
    return { verifiedRanges, completeFiles: 0, errors };
  let completeFiles = 0;
  for (const [path, file] of files) {
    const parts = (byPath.get(path) ?? []).sort(
      (a, b) => a.startLine - b.startLine,
    );
    let next = 1;
    let contiguous = parts.length > 0;
    for (const part of parts) {
      if (
        part.startLine !== next ||
        part.fileSha256 !== file.fileSha256 ||
        part.totalLines !== file.totalLines
      ) {
        errors.push(
          `${path}: ожидалась строка ${next} той же версии, получена ${part.startLine}`,
        );
        contiguous = false;
      }
      next = part.endLine + 1;
    }
    if (next !== file.totalLines + 1) {
      errors.push(
        `${path}: покрытие заканчивается на ${next - 1} из ${file.totalLines} строк`,
      );
      contiguous = false;
    }
    if (contiguous) completeFiles++;
  }
  return { verifiedRanges, completeFiles, errors };
}
