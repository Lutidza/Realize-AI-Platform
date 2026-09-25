/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/McpChatGptRuntime.types.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Ограничивает server-only передачу credentials из registry в supervisor туннеля.
 */
import type { McpChatGptObservation } from "../../../../ai-contracts/src/McpChatGpt.types";

/** Не экспортируется в browser contracts; plaintext живёт только в памяти процесса. */
export type McpChatGptLaunchPlan = {
  revision: number;
  status: McpChatGptObservation["status"];
  connection?: {
    executable: string;
    tunnelID: string;
    port: number;
    apiKey: string;
    mcpToken: string;
  };
};
export type McpChatGptRuntimePort = {
  read: () => Promise<McpChatGptLaunchPlan>;
  report: (
    revision: number,
    status: McpChatGptObservation["status"],
  ) => Promise<void>;
};
