/**
 * @file packages/ai-contracts/src/McpServer.types.ts
 * @version 1.3.0
 * @date 2026-09-26
 * @description Описывает безопасные контракты управления экземплярами MCP и их клиентами.
 * @see documentation/specifications/internal-mcp.md
 */
import type {
  McpChatGptConfiguration,
  McpChatGptConnectionDto,
} from "./McpChatGpt.types";

export type McpServerType =
  "realize-internal" | "mcp-http" | "nextjs" | "payload";
export type McpManagementSource =
  "admin_managed" | "operator_managed" | "client_managed";
export type McpDirection = "hosted_endpoint" | "external_connection";
export type McpClientGrants = {
  repositoryRead: boolean;
  pagesRead: boolean;
  workshopRead?: boolean;
  workshopWrite?: boolean;
  workshopPreview?: boolean;
};
export type McpLimits = {
  callsPerMinute: number;
  burst: number;
  concurrentCalls: number;
  responseBytes: number;
};

/** Ни путь checkout, ни произвольная команда не входят в конфигурацию браузера. */
export type McpHostedConfiguration = {
  schemaVersion: "1.0";
  serverType: "realize-internal";
  adapterVersion: "1.0";
  direction: "hosted_endpoint";
  managementSource: "admin_managed";
  environment: string;
  hostProfileID: string;
  port: number;
  allowedTools: string[];
  limits: McpLimits;
  chatgptTunnel?: McpChatGptConfiguration;
};

export type McpHttpConfiguration = {
  schemaVersion: "1.0";
  serverType: "mcp-http";
  adapterVersion: "1.0";
  direction: "external_connection";
  managementSource: "admin_managed";
  environment: string;
  hostProfileID: string;
  endpoint: string;
  authentication: "none" | "bearer";
  reviewedTools: { name: string; schemaHash: string }[];
  limits: McpLimits;
};

/** Наблюдаемая запись не обещает работающий runtime adapter. */
export type McpMetadataConfiguration = {
  schemaVersion: "1.0";
  serverType: "nextjs" | "payload";
  adapterVersion: "1.0";
  direction: "external_connection";
  managementSource: "operator_managed" | "client_managed";
  environment: string;
  profileReference: string;
};
export type McpServerConfiguration =
  McpHostedConfiguration | McpHttpConfiguration | McpMetadataConfiguration;

export type McpActionDto = { allowed: boolean; reason: string | null };
export type McpServerActionsDto = Record<
  "edit" | "enable" | "test" | "discover" | "apply" | "issueClient",
  McpActionDto
>;
export type McpServerDescriptorDto = {
  serverType: McpServerType;
  name: string;
  support: "runnable" | "metadata_only";
  direction: McpDirection;
  managementSources: McpManagementSource[];
  adapterVersion: "1.0";
  reason: string | null;
};
export type McpHostProfileDto = {
  id: string;
  label: string;
  serverTypes: ("realize-internal" | "mcp-http")[];
  allowedPorts: number[];
  repositoryGrantAllowed: boolean;
  pagesGrantAllowed: boolean;
  workshopGrantAllowed: boolean;
  maximumLimits: McpLimits;
  reason: string | null;
};
export type McpObservedStateDto = {
  status:
    | "unknown"
    | "pending"
    | "applying"
    | "applied"
    | "restart_required"
    | "failed"
    | "stale";
  appliedRevision: number | null;
  configHash: string | null;
  observedAt: string | null;
  reason: string | null;
};
export type McpServerSummaryDto = {
  serverID: string;
  displayName: string;
  serverType: McpServerType;
  direction: McpDirection;
  managementSource: McpManagementSource;
  environment: string;
  enabled: boolean;
  desiredRevision: number;
  observed: McpObservedStateDto;
  lastTestStatus: "never" | "passed" | "failed";
  lastTestedAt: string | null;
  updatedAt: string;
};
export type McpClientDto = {
  clientID: string;
  principalID: string;
  displayName: string;
  grants: McpClientGrants;
  actorBinding: "self" | "none";
  expiresAt: string;
  revokedAt: string | null;
  revision: number;
  createdAt: string;
  actions: { rotate: McpActionDto; revoke: McpActionDto };
};
export type McpDiscoveredToolDto = {
  name: string;
  description: string;
  schemaHash: string;
  inputSchema: Record<string, unknown>;
  approved: boolean;
};
export type McpServerDetailDto = McpServerSummaryDto & {
  configuration: McpServerConfiguration;
  hasCredential: boolean;
  credentialUpdatedAt: string | null;
  clients: McpClientDto[];
  clientGrantOptions: McpClientGrants;
  chatgpt: McpChatGptConnectionDto | null;
  discoveredTools: McpDiscoveredToolDto[];
  actions: McpServerActionsDto;
};
export type McpServerListDto = {
  items: McpServerSummaryDto[];
  page: number;
  limit: number;
  totalDocs: number;
  totalPages: number;
};
export type McpServerListQuery = {
  q: string;
  page: number;
  limit: number;
  serverType?: McpServerType;
  environment?: string;
  enabled?: boolean;
};
export type CreateMcpServerInput = {
  displayName: string;
  configuration: McpServerConfiguration;
  credential?: string;
};
/** Предустановка не несёт credential, enabled или grants; они задаются отдельно. */
export type McpServerPreset = {
  id: string;
  serverID: string;
  displayName: string;
  configuration: McpServerConfiguration;
};
export type McpServerPresetDto = {
  id: string;
  serverID: string;
  displayName: string;
  installed: boolean;
};
export type McpInstallPresetsDto = {
  createdServerIDs: string[];
  existingServerIDs: string[];
};
export type UpdateMcpServerInput = CreateMcpServerInput & {
  expectedRevision: number;
};
export type McpRevisionInput = { expectedRevision: number };
export type SetMcpServerEnabledInput = McpRevisionInput & { enabled: boolean };
export type IssueMcpClientInput = McpRevisionInput & {
  displayName: string;
  grants: McpClientGrants;
  actorBinding: "self" | "none";
  expiresAt: string;
};
export type McpOneTimeTokenDto = {
  client: McpClientDto;
  token: string | null;
  replayed: boolean;
  desiredRevision: number;
};
export type McpServerMutationDto = {
  server: McpServerDetailDto;
  replayed: boolean;
};
export type McpProbeResultDto = {
  serverID: string;
  checkedRevision: number;
  checkedAt: string;
  status: "passed" | "failed";
  message: string;
  tools: McpDiscoveredToolDto[];
  replayed: boolean;
};
export type McpApplyResultDto = {
  serverID: string;
  requestID: string;
  desiredRevision: number;
  configHash: string;
  status: "pending" | "applied" | "restart_required" | "failed";
  replayed: boolean;
};
export type McpAuditEventDto = {
  id: string;
  action: string;
  status: "passed" | "failed";
  summary: string;
  createdAt: string;
};
export type McpAuditListDto = {
  items: McpAuditEventDto[];
  page: number;
  limit: number;
  totalDocs: number;
  totalPages: number;
};
