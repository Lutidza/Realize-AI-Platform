/**
 * @file packages/ai-contracts/src/McpChatGpt.types.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Описывает настройку ChatGPT без чтения клиентских credentials.
 * @see documentation/specifications/internal-mcp.md
 */
import type {
  McpActionDto,
  McpReadGrants,
  McpRevisionInput,
} from "./McpServer.types";

/** Секреты хранятся отдельно в vault, configuration остаётся безопасной для Admin. */
export type McpChatGptConfiguration = { tunnelID: string; clientID: string };
export type McpChatGptStatus =
  | "not_configured"
  | "disabled"
  | "pending"
  | "starting"
  | "connected"
  | "failed"
  | "stale";
export type McpChatGptObservation = {
  revision: number;
  status: "disabled" | "pending" | "starting" | "connected" | "failed";
  observedAt: string;
};
export type McpChatGptConnectionDto = {
  tunnelID: string | null;
  clientID: string | null;
  hasApiKey: boolean;
  grants: McpReadGrants;
  expiresAt: string | null;
  status: McpChatGptStatus;
  observedAt: string | null;
  actions: { configure: McpActionDto; disconnect: McpActionDto };
};
/** apiKey передаётся только на запись; отсутствие при update сохраняет прежний ключ. */
export type SaveMcpChatGptInput = McpRevisionInput & {
  tunnelID: string;
  apiKey?: string;
  grants: McpReadGrants;
  expiresAt: string;
};
