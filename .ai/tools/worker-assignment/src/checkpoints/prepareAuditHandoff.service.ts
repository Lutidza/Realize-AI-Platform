/**
 * @file .ai/tools/worker-assignment/src/checkpoints/prepareAuditHandoff.service.ts
 * @version 2.0.0
 * @date 2026-11-26
 * @description Собирает версию отчёта и подтверждённое покрытие файлов для независимого ревью.
 * @see documentation/specifications/task-management/execution/attempts-and-dossier.md
 */
import { isDeepStrictEqual } from "node:util";
import type { BoundAssignment } from "../admission/AssignmentAdmission.types";
import type { CheckpointSnapshot, ConfirmedRead } from "./Checkpoint.types";
import { hashAuditText } from "./hashAuditText.util";
import { verifyAuditReadReceipts } from "./verifyAuditReadReceipts.validator";

/** Сохраняет пробелы и объединяет пересечения и соседние строки одной версии. */
function mergeRanges(
  reads: ReadonlyArray<{ startLine: number; endLine: number }>,
) {
  const ranges: { startLine: number; endLine: number }[] = [];
  for (const { startLine, endLine } of reads) {
    if (endLine < startLine) continue; // Пустой файл даёт квитанцию без строк.
    const last = ranges.at(-1);
    if (last && startLine <= last.endLine + 1) {
      last.endLine = Math.max(last.endLine, endLine);
    } else {
      ranges.push({ startLine, endLine });
    }
  }
  return ranges;
}

/** Передаёт отчёт завершённой попытки и покрытие файлов из проверенного контекста назначения. */
export function prepareAuditHandoff(
  snapshot: CheckpointSnapshot,
  receipts: readonly ConfirmedRead[],
  context: Pick<
    BoundAssignment["context"],
    "contextId" | "scopePins" | "readPins"
  >,
) {
  const { attemptId, revision, state } = snapshot;
  if (state.status !== "received") throw new Error("audit_report_unverified");
  const { report, identity } = state;
  if (!report.text.trim() || hashAuditText(report.text) !== report.sha256)
    throw new Error("audit_report_unverified");
  if (
    context.contextId !== identity.selection.contextId ||
    !isDeepStrictEqual(context.scopePins, identity.scopePins)
  )
    throw new Error("audit_scope_mismatch");
  const reads = verifyAuditReadReceipts(snapshot, receipts, context.readPins);

  const coverage = Object.keys(context.scopePins)
    .sort()
    .map((path) => {
      const records = reads.get(path) ?? [];
      records.sort(
        (a, b) =>
          a.startLine - b.startLine ||
          a.endLine - b.endLine ||
          (a.toolCallId < b.toolCallId ? -1 : 1),
      );
      return {
        path,
        sha256: context.scopePins[path],
        status: records.length ? ("read" as const) : ("unread" as const),
        ranges: mergeRanges(records),
        receipts: records,
      };
    });
  const manifest = {
    schemaVersion: 1 as const,
    attemptId,
    checkpointRevision: revision,
    task: identity.task,
    report: report.text,
    reportSha256: report.sha256,
    coverage,
  };
  return {
    ...manifest,
    handoffSha256: hashAuditText(JSON.stringify(manifest)),
  };
}
