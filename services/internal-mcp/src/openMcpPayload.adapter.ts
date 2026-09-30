/**
 * @file services/internal-mcp/src/openMcpPayload.adapter.ts
 * @version 1.1.0
 * @date 2026-09-25
 * @description Подключает host config к общему Payload bootstrap без schema push и фоновых jobs.
 * @see documentation/specifications/internal-mcp.md
 */
import { openBackgroundPayload } from "@realize/payload-ai-control/server/background-runtime";
export async function openMcpPayload() {
  if (
    process.env.PAYLOAD_DB_PUSH === "true" ||
    process.env.PAYLOAD_DROP_DATABASE === "true"
  )
    throw new Error("MCP refuses schema-changing startup.");
  const { default: configuration } =
    await import("../../../src/payload.config");
  return openBackgroundPayload(configuration);
}
