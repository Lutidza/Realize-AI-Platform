/**
 * @file packages/payload-access-management/src/server/readAccessBody.adapter.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Читает ограниченный поток JSON без отражения body или секретов в ошибках.
 * @see documentation/architecture/platform-access.md
 */
import type { PayloadRequest } from "payload";
import { AccessManagementError } from "./AccessManagement.error";
const MAX_BYTES = 8192;
export async function readAccessBody(req: PayloadRequest): Promise<unknown> {
  const invalid = () =>
    new AccessManagementError(
      "INVALID_REQUEST",
      "Ожидается JSON не более 8192 байт.",
      422,
    );
  const length = req.headers.get("content-length");
  if (
    (length !== null &&
      (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) ||
    req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
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
      if (size > MAX_BYTES) throw invalid();
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
