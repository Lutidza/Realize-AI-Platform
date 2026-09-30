/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/readMcpBody.adapter.ts
 * @version 1.0.1
 * @date 2026-09-25
 * @description Ограничивает management JSON MCP до разбора и исключает исходное тело из ошибок.
 */
import type { PayloadRequest } from "payload";
import { readBoundedJsonBody } from "../../endpoints/readBoundedJsonBody.adapter";

export async function readMcpBody(req: PayloadRequest): Promise<unknown> {
  return readBoundedJsonBody(req, 65536);
}
