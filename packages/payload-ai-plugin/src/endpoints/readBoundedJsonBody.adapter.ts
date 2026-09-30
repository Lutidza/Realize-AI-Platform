/**
 * @file packages/payload-ai-plugin/src/endpoints/readBoundedJsonBody.adapter.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Читает строго bounded UTF-8 JSON и не включает исходный текст в ошибки API.
 * @see documentation/specifications/design-workshop.md
 */
import type { PayloadRequest } from "payload";
import { EndpointError } from "./http";

export async function readBoundedJsonBody(
  req: PayloadRequest,
  maxBytes: number,
): Promise<unknown> {
  const invalid = () =>
    new EndpointError(
      "INVALID_REQUEST",
      `Ожидается JSON не более ${maxBytes} байт.`,
      400,
    );
  const declaredLength = req.headers.get("content-length");
  if (
    (declaredLength !== null &&
      (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)) ||
    req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
      "application/json"
  )
    throw invalid();
  const reader = req.body?.getReader();
  if (!reader) throw invalid();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > maxBytes) throw invalid();
      chunks.push(part.value);
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
