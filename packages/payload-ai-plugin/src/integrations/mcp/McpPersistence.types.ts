/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/McpPersistence.types.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Описывает закрытые снимки применения MCP и проверенный context management запроса.
 */
import type { PayloadRequest } from "payload";
import type {
  McpHostedConfiguration,
  McpReadGrants,
} from "../../../../ai-contracts/src/McpServer.types";
export type McpAppliedSnapshot = {
  serverID: string;
  revision: number;
  enabled: boolean;
  configuration: McpHostedConfiguration;
  clients: {
    clientID: string;
    revision: number;
    grants: McpReadGrants;
    actorID: string | null;
  }[];
};
export type McpManagementContext = {
  req: PayloadRequest;
  actor: NonNullable<PayloadRequest["user"]>;
  requestKey: string;
};
