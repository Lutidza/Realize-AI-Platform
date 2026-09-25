/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/readMcpBody.adapter.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Ограничивает management JSON MCP до разбора и исключает исходное тело из ошибок.
 */
import type { PayloadRequest } from "payload";
import { EndpointError } from "../../endpoints/http";

export async function readMcpBody(req: PayloadRequest): Promise<unknown> {
  const invalid = () =>
    new EndpointError(
      "INVALID_REQUEST",
      "Ожидается JSON не более 64 КиБ.",
      400,
    );
  if (
    Number(req.headers.get("content-length")) > 65536 ||
    !req.headers.get("content-type")?.includes("application/json")
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
      if (length > 65536) throw invalid();
      chunks.push(part.value);
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch {
    throw invalid();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
