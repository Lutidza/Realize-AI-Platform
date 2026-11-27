/**
 * @file .ai/tools/worker-assignment/src/readAuditPassage.service.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Повторно выдаёт точный фрагмент или компактные смежные части источника для предметного уточнения.
 * @see documentation/specifications/internal-mcp.md
 */
import { isDeepStrictEqual } from "node:util";
import {
  readRepositoryFile,
  type RepositoryReadPolicy,
} from "realize-ai-platform/repository-read-policy";
import type {
  IdeAuditDelivery,
  IdeAuditRange,
} from "realize-ai-platform/ide-assignment-queue";
import { planAuditRanges, verifyAuditDeliveries } from "./auditRanges.service";
import { executeIsolatedIdeAudit } from "./adapters/executeIsolatedIdeAudit.adapter";
import { hashAuditText } from "./checkpoints/hashAuditText.util";
import { planTextAssignment } from "./planTextAssignment.service";
import type { AuditLookup } from "./auditSearchScope.service";

/** Нулевая строка заказывает повторное полное чтение. Точечный запрос не добавляет EOF-покрытия. */
export function planAuditPassage(
  path: string,
  text: string,
  sha: string,
  line: number,
  definition = false,
): IdeAuditRange[] {
  if (!line) return planAuditRanges(path, text, sha, 24 * 1024);
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  if (!Number.isSafeInteger(line) || line < 1 || line > lines.length) return [];
  if (definition && Buffer.byteLength(text) <= 24 * 1024)
    return planAuditRanges(path, text, sha, 24 * 1024);
  const startLine = Math.max(1, line - (definition ? 4 : 12)),
    endLine = Math.min(lines.length, line + (definition ? 60 : 12));
  const content = lines.slice(startLine - 1, endLine).join("");
  return [
    {
      path,
      startLine,
      endLine,
      totalLines: lines.length,
      fileSha256: sha,
      rangeSha256: hashAuditText(content),
      byteLength: Buffer.byteLength(content),
    },
  ];
}

export async function readAuditPassage(options: {
  policy: RepositoryReadPolicy;
  id: string;
  request: AuditLookup;
  mission: string;
  signal: AbortSignal;
  knownPaths: Iterable<string>;
  expectedSha?: string;
  renew: () => void;
  record: (step: unknown) => void;
  delivery: (expected: IdeAuditDelivery, actual: IdeAuditDelivery) => void;
}) {
  const { policy, request, signal } = options,
    path = request.source;
  const file = await readRepositoryFile(policy, path, { signal });
  if (options.expectedSha && file.sha256 !== options.expectedSha)
    throw new Error("assignment_search_snapshot_changed: " + path);
  const ranges = planAuditPassage(
    path,
    file.text,
    file.sha256,
    request.line,
    !!request.definition,
  );
  const notes: string[] = [],
    expected: IdeAuditDelivery[] = [],
    actual: IdeAuditDelivery[] = [];
  const reviewed: IdeAuditRange[] = [];
  const answers: { range: IdeAuditRange; report: string }[] = [];
  for (const range of ranges) {
    signal.throwIfAborted();
    options.renew();
    const assignmentId = options.id + "." + (expected.length + 1);
    const ref = path + ":" + range.startLine + "–" + range.endLine;
    const bound = await planTextAssignment(
      policy,
      assignmentId,
      (
        "Проверь закреплённый диапазон " +
        ref +
        ". Вопрос: " +
        request.value +
        ". Предмет исследования: " +
        options.mission
      ).slice(0, 2048),
      [path],
      "Адресное уточнение источника",
      options.knownPaths,
      "passage",
    );
    if (!bound.context || bound.context.readPins[path] !== file.sha256)
      throw new Error("assignment_search_snapshot_changed: " + path);
    const plan = { assignmentId, ranges: [range] };
    expected.push(plan);
    const result = await executeIsolatedIdeAudit(
      bound,
      signal,
      { [path]: [range.startLine, range.endLine] },
      undefined,
      "",
      (receipts) => {
        if (!isDeepStrictEqual(receipts, plan.ranges))
          throw new Error("assignment_delivery_incomplete: " + ref);
        const received = { assignmentId, ranges: receipts };
        options.delivery(plan, received);
        actual.push(received);
      },
    );
    if (result.status === "completed") {
      reviewed.push(range);
      answers.push({ range, report: result.report });
    }
    notes.push(ref + " " + result.status + " " + result.report.slice(0, 1600));
    options.record({
      phase: "passage-review",
      request,
      assignmentId,
      range,
      status: result.status,
      report: result.report,
    });
  }
  const proof = verifyAuditDeliveries(
    expected,
    actual,
    request.line ? "search-windows" : "whole-file",
  );
  if (proof.errors.length)
    throw new Error(
      "assignment_delivery_incomplete: " + proof.errors.join(", "),
    );
  if (!ranges.length) notes.push("Запрошенная строка вне границ файла " + path);
  else if (request.line && reviewed.length) {
    const lines = file.text.split("\n");
    const start = Math.max(1, request.line - 2);
    notes.push(
      lines
        .slice(start - 1, request.line + 2)
        .map((line, i) => path + ":" + (start + i) + " " + line.slice(0, 300))
        .join("\n"),
    );
  }
  return {
    notes,
    reviewed,
    answers,
    whole: proof.completeFiles === 1 && reviewed.length === ranges.length,
  };
}
