/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/mapMcpServer.mapper.ts
 * @version 1.2.0
 * @date 2026-09-26
 * @description Формирует безопасные Admin DTO экземпляров и клиентов без verifiers и applied snapshot.
 */
import type {
  McpClientDto,
  McpServerSummaryDto,
  McpServerDetailDto,
  McpObservedStateDto,
  McpActionDto,
  McpClientGrants,
} from "../../../../ai-contracts/src/McpServer.types";
import { z } from "zod";
import type { AIDocument } from "../../endpoints/repository";
import { relationID } from "../../endpoints/mappers";
import { readMcpConfiguration } from "./validateMcpConfiguration.validator";
import { mapMcpChatGpt } from "./mapMcpChatGpt.mapper";

const discoveredSchema = z
  .array(
    z.strictObject({
      name: z.string().max(128),
      description: z.string().max(1000),
      schemaHash: z.string().regex(/^[a-f0-9]{64}$/),
      inputSchema: z.record(z.string(), z.unknown()),
      approved: z.boolean(),
    }),
  )
  .max(100);

const action = (allowed: boolean, reason: string): McpActionDto => ({
  allowed,
  reason: allowed ? null : reason,
});
export function mapMcpClient(
  record: AIDocument,
  actorID: string,
  connectorOwned = false,
): McpClientDto {
  const grants = record.grants as {
    repositoryRead: boolean;
    pagesRead: boolean;
    workshopRead?: boolean;
    workshopWrite?: boolean;
    workshopPreview?: boolean;
  };
  const owns =
    relationID(record.createdBy) === actorID &&
    Date.parse(String(record.expiresAt)) > Date.now();
  return {
    clientID: String(record.clientID),
    principalID: String(record.principalID),
    displayName: String(record.displayName),
    grants: {
      repositoryRead: grants.repositoryRead === true,
      pagesRead: grants.pagesRead === true,
      workshopRead: grants.workshopRead === true,
      workshopWrite: grants.workshopWrite === true,
      workshopPreview: grants.workshopPreview === true,
    },
    actorBinding: record.actor ? "self" : "none",
    expiresAt: String(record.expiresAt),
    revokedAt: typeof record.revokedAt === "string" ? record.revokedAt : null,
    revision: Number(record.revision),
    createdAt: String(record.createdAt),
    actions: {
      rotate: action(
        owns && !record.revokedAt && !connectorOwned,
        connectorOwned
          ? "Ключ обновляется в настройках ChatGPT."
          : "Перевыпуск доступен только создателю действующего клиента.",
      ),
      revoke: action(!record.revokedAt, "Ключ уже отозван."),
    },
  };
}

export function mapMcpServerSummary(
  record: AIDocument,
  receipt?: AIDocument,
): McpServerSummaryDto {
  const configuration = readMcpConfiguration(record.configuration);
  const observedAt =
    typeof receipt?.observedAt === "string" ? receipt.observedAt : null;
  const stale =
    observedAt !== null &&
    (!Number.isFinite(Date.parse(observedAt)) ||
      Date.now() - Date.parse(observedAt) > 30000);
  const revision = Number(record.revision);
  let status: McpObservedStateDto["status"] =
    (receipt?.status as McpObservedStateDto["status"]) ?? "unknown";
  if (stale) status = "stale";
  else if (
    status === "applied" &&
    Number(receipt?.appliedRevision) !== revision
  )
    status = "pending";
  return {
    serverID: String(record.connectionKey).slice(4),
    displayName: String(record.displayName),
    serverType: configuration.serverType,
    direction: configuration.direction,
    managementSource: configuration.managementSource,
    environment: configuration.environment,
    enabled: record.enabled === true,
    desiredRevision: revision,
    observed: {
      status,
      appliedRevision:
        typeof receipt?.appliedRevision === "number"
          ? receipt.appliedRevision
          : null,
      configHash:
        typeof receipt?.configHash === "string" ? receipt.configHash : null,
      observedAt,
      reason: stale
        ? "Подтверждение процесса устарело."
        : typeof receipt?.reason === "string"
          ? receipt.reason
          : null,
    },
    lastTestStatus:
      record.lastTestStatus as McpServerSummaryDto["lastTestStatus"],
    lastTestedAt:
      typeof record.lastTestedAt === "string" ? record.lastTestedAt : null,
    updatedAt: String(record.updatedAt),
  };
}

export function mapMcpServerDetail(
  record: AIDocument,
  clients: AIDocument[],
  receipt: AIDocument | undefined,
  actorID: string,
  capabilities: {
    ready: boolean;
    grants: McpClientGrants;
    tunnelReady?: boolean;
  },
): McpServerDetailDto {
  const configuration = readMcpConfiguration(record.configuration);
  const hosted = configuration.serverType === "realize-internal";
  const ready = capabilities.ready;
  const discovered = discoveredSchema.safeParse(receipt?.discoveredTools ?? []);
  const why = hosted
    ? "Требуется доверенный host profile и запущенный оператором процесс."
    : "Adapter управляется внешним клиентом; runtime действия не подключены.";
  return {
    ...mapMcpServerSummary(record, receipt),
    configuration,
    hasCredential: !!record.credentialEnvelope,
    credentialUpdatedAt:
      typeof record.credentialUpdatedAt === "string"
        ? record.credentialUpdatedAt
        : null,
    clients: clients.map((client) =>
      mapMcpClient(
        client,
        actorID,
        hosted && configuration.chatgptTunnel?.clientID === client.clientID,
      ),
    ),
    clientGrantOptions: capabilities.grants,
    chatgpt: hosted
      ? mapMcpChatGpt(
          record,
          configuration,
          clients,
          receipt,
          capabilities.tunnelReady === true,
        )
      : null,
    discoveredTools: discovered.success
      ? discovered.data.map((tool) => ({
          ...tool,
          approved: hosted && configuration.allowedTools.includes(tool.name),
        }))
      : [],
    actions: {
      edit: action(true, ""),
      enable: action(hosted && ready, why),
      test: action(hosted && ready, why),
      discover: action(hosted && ready, why),
      apply: action(hosted && ready, why),
      issueClient: action(hosted && ready, why),
    },
  };
}
