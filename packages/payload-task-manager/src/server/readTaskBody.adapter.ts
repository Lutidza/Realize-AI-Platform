/**
 * @file packages/payload-task-manager/src/server/readTaskBody.adapter.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Читает ограниченный UTF-8 JSON команды без доверия Content-Length.
 * @see documentation/specifications/task-management-execution.md
 */
import type { PayloadRequest } from "payload";
import { TASK_REQUEST_BYTES } from "../taskManager.constants";
import { TaskManagerError } from "./TaskManager.error";

/** Размер проверяется по реальному потоку; исходный body не попадает в ошибки. */
export async function readTaskBody(req: PayloadRequest): Promise<unknown> {
  const invalid = () =>
    new TaskManagerError(
      "INVALID_REQUEST",
      `Ожидается JSON не более ${TASK_REQUEST_BYTES} байт.`,
      422,
    );
  const declared = req.headers.get("content-length");
  if (
    (declared !== null &&
      (!/^\d+$/.test(declared) || Number(declared) > TASK_REQUEST_BYTES)) ||
    req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
      "application/json"
  )
    throw invalid();
  const reader = req.body?.getReader();
  if (!reader) throw invalid();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > TASK_REQUEST_BYTES) throw invalid();
      chunks.push(chunk.value);
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch {
    throw invalid();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
