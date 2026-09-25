/**
 * @file packages/ai-contracts/src/integrationEvents.constants.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Задаёт реальные действия audit интеграций и управления MCP доступом.
 */
export const INTEGRATION_EVENT_ACTIONS = [
  "saved",
  "tested",
  "disconnected",
  "mcp_created",
  "mcp_updated",
  "mcp_enabled",
  "mcp_client_issued",
  "mcp_client_rotated",
  "mcp_client_revoked",
  "mcp_apply_requested",
  "mcp_discovered",
] as const;
