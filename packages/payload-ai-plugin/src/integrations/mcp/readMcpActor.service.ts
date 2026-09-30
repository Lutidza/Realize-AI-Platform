/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/readMcpActor.service.ts
 * @version 1.1.0
 * @date 2026-09-25
 * @description Проверяет действующего actor и оба разрешения административного MCP чтения.
 * @see documentation/specifications/internal-mcp.md
 */
import type { Payload, PayloadRequest } from "payload";
import { EndpointError } from "../../endpoints/http";
import { readRuntimeActor } from "../../runtime/readRuntimeActor.service";
export async function readMcpActor(
  payload: Payload,
  userID: string,
): Promise<PayloadRequest> {
  const { req, runtime } = await readRuntimeActor(payload, userID);
  if (
    !(await runtime.canUseChat({ req })) ||
    !(await runtime.canManageData({ req }))
  )
    throw new EndpointError(
      "FORBIDDEN",
      "Текущие права не разрешают административное чтение Pages.",
      403,
    );
  return req;
}
