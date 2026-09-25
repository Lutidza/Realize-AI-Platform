/**
 * @file packages/ai-contracts/src/mcpServerPresets.config.ts
 * @version 1.0.0
 * @date 2026-09-24
 * @description Задаёт стабильные предустановки MCP без credentials и разрешений клиентов.
 * @see documentation/specifications/internal-mcp.md
 */
import type { McpServerPreset } from "./McpServer.types";
import { MCP_DEFAULT_LIMITS, MCP_REALIZE_TOOLS } from "./mcpServer.config";

/** ID сохраняется между версиями; обновление шаблона не переписывает существующий экземпляр. */
export const MCP_SERVER_PRESETS: readonly McpServerPreset[] = [
  {
    id: "realize-internal",
    serverID: "9a0a3adc-d984-4f11-8126-8b2ef13a046a",
    displayName: "Realize Internal",
    configuration: {
      schemaVersion: "1.0",
      adapterVersion: "1.0",
      serverType: "realize-internal",
      direction: "hosted_endpoint",
      managementSource: "admin_managed",
      environment: "local",
      hostProfileID: "realize-local",
      port: 4320,
      allowedTools: [...MCP_REALIZE_TOOLS],
      limits: { ...MCP_DEFAULT_LIMITS },
    },
  },
];
