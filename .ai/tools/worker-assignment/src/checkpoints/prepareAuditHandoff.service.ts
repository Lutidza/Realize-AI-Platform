/**
 * @file .ai/tools/worker-assignment/src/checkpoints/prepareAuditHandoff.service.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Собирает версию отчёта и подтверждённое покрытие файлов для независимого ревью.
 * @see documentation/specifications/task-management/execution/attempts-and-dossier.md
 */
import { isDeepStrictEqual } from "node:util";
import type { CheckpointSnapshot, ConfirmedRead } from "./Checkpoint.types";
import { hashAuditText } from "./hashAuditText.util";

const digestPattern = /^[0-9a-f]{64}$/;

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

/** Принимает только завершённый снимок и квитанции его попытки из хранилища runtime. */
export function prepareAuditHandoff(
  snapshot: CheckpointSnapshot,
  receipts: readonly ConfirmedRead[],
) {
  const { attemptId, revision, state } = snapshot;
  if (state.status !== "received") throw new Error("audit_report_unverified");
  const { report, identity } = state;
  if (!report.text.trim() || hashAuditText(report.text) !== report.sha256)
    throw new Error("audit_report_unverified");
  const paths = Object.keys(identity.scopePins).sort();
  if (
    paths.length !== 12 ||
    paths.some((path) => !digestPattern.test(identity.scopePins[path]))
  )
    throw new Error("audit_scope_mismatch");

  const history = new Map(
    state.history.map((entry) => [entry.key.toolCallId, entry]),
  );
  if (history.size !== state.history.length || receipts.length !== history.size)
    throw new Error("audit_history_incomplete");
  const seenRequests = new Set<string>();
  const delivered = receipts.flatMap(({ requestId, operation }) => {
    const { key, receipt } = operation;
    const entry = history.get(key.toolCallId);
    if (
      key.attemptId !== attemptId ||
      key.requestId === requestId ||
      !requestId ||
      !key.requestId ||
      !key.toolCallId ||
      !entry ||
      !isDeepStrictEqual(entry.key, key) ||
      entry.delivery.requestId !== requestId ||
      entry.delivery.operationSha256 !==
        hashAuditText(JSON.stringify(operation)) ||
      seenRequests.has(requestId)
    )
      throw new Error("audit_receipt_mismatch");
    history.delete(key.toolCallId);
    seenRequests.add(requestId);
    if (
      operation.outcome === "denied" &&
      !receipt &&
      operation.code === "FORBIDDEN"
    )
      return [];
    if (
      operation.outcome !== "read" ||
      operation.code !== null ||
      !receipt ||
      operation.name !== "repo_read_file" ||
      operation.arguments?.path !== receipt.path ||
      operation.expectedSha256 !== receipt.sha256 ||
      !digestPattern.test(receipt.sha256) ||
      !Number.isSafeInteger(receipt.startLine) ||
      !Number.isSafeInteger(receipt.endLine) ||
      receipt.startLine < 1 ||
      (receipt.endLine < receipt.startLine &&
        !(receipt.startLine === 1 && receipt.endLine === 0))
    )
      throw new Error("audit_receipt_invalid");
    // Шесть источников назначения также доступны аудитору; карта ревью относится к двенадцати файлам формы.
    if (!Object.hasOwn(identity.scopePins, receipt.path)) return [];
    if (identity.scopePins[receipt.path] !== receipt.sha256)
      throw new Error("audit_pin_mismatch");
    return [
      {
        path: receipt.path,
        record: {
          sourceRequestId: key.requestId,
          requestId,
          toolCallId: key.toolCallId,
          startLine: receipt.startLine,
          endLine: receipt.endLine,
          truncated: receipt.truncated,
        },
      },
    ];
  });

  const coverage = paths.map((path) => {
    const records = delivered
      .filter((read) => read.path === path)
      .map((read) => read.record);
    records.sort(
      (a, b) =>
        a.startLine - b.startLine ||
        a.endLine - b.endLine ||
        (a.toolCallId < b.toolCallId ? -1 : 1),
    );
    return {
      path,
      sha256: identity.scopePins[path],
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
