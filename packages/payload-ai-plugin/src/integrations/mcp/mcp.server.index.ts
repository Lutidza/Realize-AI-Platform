/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/mcp.server.index.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Экспортирует серверные порты managed MCP и Pages без browser credentials.
 */
export { McpRuntime } from "./McpRuntime.service";
export { readMcpPage } from "./readMcpPage.service";
export { readMcpHostProfiles } from "./readMcpHostProfiles.config";
export type { McpHostProfile } from "./McpHostProfile.types";
