/**
 * @file .ai/tools/worker-assignment/src/checkpoints/verifyAuditReadReceipts.validator.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Сверяет квитанции с историей попытки и разрешёнными версиями всех прочитанных файлов.
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import { isDeepStrictEqual } from "node:util";
import type { AuditFileCoverage } from "@realize/payload-task-manager/audit-review";
import type { CheckpointSnapshot, ConfirmedRead } from "./Checkpoint.types";
import { hashAuditText } from "./hashAuditText.util";

/** Подтверждённый отказ занимает место в истории, но не добавляет прочитанных строк. */
export function verifyAuditReadReceipts(
  snapshot: CheckpointSnapshot,
  receipts: readonly ConfirmedRead[],
  readPins: Readonly<Record<string, string>>,
) {
  const { attemptId, state } = snapshot;
  const history = new Map(
    state.history.map((entry) => [entry.key.toolCallId, entry]),
  );
  if (history.size !== state.history.length || receipts.length !== history.size)
    throw new Error("audit_history_incomplete");

  const byPath = new Map<string, AuditFileCoverage["receipts"]>();
  const seenRequests = new Set<string>();
  for (const { requestId, operation } of receipts) {
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
      continue;
    if (
      operation.outcome !== "read" ||
      operation.code !== null ||
      !receipt ||
      operation.name !== "repo_read_file" ||
      operation.arguments?.path !== receipt.path ||
      operation.expectedSha256 !== receipt.sha256 ||
      !Number.isSafeInteger(receipt.startLine) ||
      !Number.isSafeInteger(receipt.endLine) ||
      receipt.startLine < 1 ||
      (receipt.endLine < receipt.startLine &&
        !(receipt.startLine === 1 && receipt.endLine === 0))
    )
      throw new Error("audit_receipt_invalid");
    if (
      !Object.hasOwn(readPins, receipt.path) ||
      readPins[receipt.path] !== receipt.sha256
    )
      throw new Error("audit_pin_mismatch");

    const records = byPath.get(receipt.path) ?? [];
    records.push({
      sourceRequestId: key.requestId,
      requestId,
      toolCallId: key.toolCallId,
      startLine: receipt.startLine,
      endLine: receipt.endLine,
      truncated: receipt.truncated,
    });
    byPath.set(receipt.path, records);
  }
  return byPath;
}
