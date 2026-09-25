/**
 * @file services/internal-mcp/src/Mcp.error.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Передаёт безопасные ошибки границ MCP без исходного SQL, stack или credential.
 */
import type { mcpErrorCodes } from "../../../packages/ai-contracts/src/mcpToolOutputs.config";
export class McpError extends Error {
  constructor(
    public readonly code: (typeof mcpErrorCodes)[number],
    message: string,
    public readonly httpStatus = 403,
  ) {
    super(message);
  }
}
