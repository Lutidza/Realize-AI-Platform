/**
 * @file packages/payload-extension-manager/src/server/readExtensionBody.adapter.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Читает bounded JSON stream команды без доверия Content-Length и без логирования body.
 * @see documentation/specifications/extension-management.md
 */
import type { PayloadRequest } from "payload";
import { ExtensionManagerHttpError } from "./ExtensionManagerHttp.error";

const requestBytes = 32 * 1024;

/** Паттерн Task transport сохранён; независимый package не импортирует чужой домен. */
export async function readExtensionBody(req: PayloadRequest): Promise<unknown> {
  const declared = req.headers.get("content-length");
  if (
    (declared !== null &&
      (!/^\d+$/.test(declared) || Number(declared) > requestBytes)) ||
    req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
      "application/json"
  )
    throw new ExtensionManagerHttpError("INVALID_REQUEST");
  const reader = req.body?.getReader();
  if (!reader) throw new ExtensionManagerHttpError("INVALID_REQUEST");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > requestBytes)
        throw new ExtensionManagerHttpError("INVALID_REQUEST");
      chunks.push(chunk.value);
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch {
    throw new ExtensionManagerHttpError("INVALID_REQUEST");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
