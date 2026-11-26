/**
 * @file .ai/tools/worker-assignment/src/checkpoints/hashAuditText.util.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Вычисляет SHA-256 точных байтов UTF-8 сообщений, квитанций и ревизий отчётов.
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import { createHash } from "node:crypto";

export function hashAuditText(text: string) {
  return createHash("sha256").update(text).digest("hex");
}
