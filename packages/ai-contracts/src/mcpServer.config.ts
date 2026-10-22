/**
 * @file packages/ai-contracts/src/mcpServer.config.ts
 * @version 1.3.0
 * @date 2026-10-22
 * @description Задаёт каталог поддержанных типов и инструментов MCP.
 */
import { MCP_WORKSHOP_TOOLS } from "./mcpWorkshop.config";
import type { McpLimits, McpServerDescriptorDto } from "./McpServer.types";

export const MCP_REALIZE_TOOLS = [
  ...MCP_WORKSHOP_TOOLS,
  "realize_get_context",
  "ai_context_resolve",
  "ai_instructions_get",
  "ai_capabilities_list",
  "repo_list_files",
  "repo_read_file",
  "repo_search",
  "repo_git_head",
  "repo_git_status",
  "repo_git_diff",
  "pages_list",
  "pages_get",
  "pages_get_structure",
] as const;
export const MCP_DEFAULT_LIMITS: Readonly<McpLimits> = Object.freeze({
  callsPerMinute: 60,
  burst: 10,
  concurrentCalls: 4,
  responseBytes: 131072,
});
export const MCP_SERVER_DESCRIPTORS: readonly McpServerDescriptorDto[] = [
  {
    serverType: "realize-internal",
    name: "Realize Internal",
    support: "runnable",
    direction: "hosted_endpoint",
    managementSources: ["admin_managed"],
    adapterVersion: "1.0",
    reason: null,
  },
  {
    serverType: "nextjs",
    name: "Next.js",
    support: "metadata_only",
    direction: "external_connection",
    managementSources: ["client_managed", "operator_managed"],
    adapterVersion: "1.0",
    reason:
      "Настройка принадлежит внешнему development client; управляемый adapter ещё не подключён.",
  },
  {
    serverType: "payload",
    name: "Payload CMS",
    support: "metadata_only",
    direction: "external_connection",
    managementSources: ["client_managed", "operator_managed"],
    adapterVersion: "1.0",
    reason: "Управляемый Payload MCP adapter ещё не подключён.",
  },
];
