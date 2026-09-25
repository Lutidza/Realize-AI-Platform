/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/mapMcpChatGpt.mapper.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Строит безопасный статус ChatGPT с проверкой revision, срока и свежести наблюдения.
 */
import { z } from "zod";
import type {
  McpChatGptConnectionDto,
  McpChatGptStatus,
} from "../../../../ai-contracts/src/McpChatGpt.types";
import type { McpHostedConfiguration } from "../../../../ai-contracts/src/McpServer.types";
import type { AIDocument } from "../../endpoints/repository";

const observation = z.strictObject({
  revision: z.number().int().positive(),
  status: z.enum(["disabled", "pending", "starting", "connected", "failed"]),
  observedAt: z.iso.datetime(),
});

export function mapMcpChatGpt(
  record: AIDocument,
  configuration: McpHostedConfiguration,
  clients: AIDocument[],
  receipt: AIDocument | undefined,
  ready: boolean,
): McpChatGptConnectionDto {
  const binding = configuration.chatgptTunnel;
  const client = clients.find((entry) => entry.clientID === binding?.clientID);
  const grants = client?.grants as
    { repositoryRead?: boolean; pagesRead?: boolean } | undefined;
  const parsed = observation.safeParse(receipt?.chatgptTunnel);
  const observed = parsed.success ? parsed.data : null;
  let status: McpChatGptStatus = "not_configured";
  if (binding) {
    if (!record.enabled) status = "disabled";
    else if (
      !client ||
      client.revokedAt ||
      Date.parse(String(client.expiresAt)) <= Date.now() ||
      !record.credentialEnvelope
    )
      status = "failed";
    else if (!observed || observed.revision !== record.revision)
      status = "pending";
    else if (Date.now() - Date.parse(observed.observedAt) > 30000)
      status = "stale";
    else status = observed.status;
  }
  return {
    tunnelID: binding?.tunnelID ?? null,
    clientID: binding?.clientID ?? null,
    hasApiKey: !!record.credentialEnvelope,
    grants: {
      repositoryRead: grants?.repositoryRead === true,
      pagesRead: grants?.pagesRead === true,
    },
    expiresAt: typeof client?.expiresAt === "string" ? client.expiresAt : null,
    status,
    observedAt: observed?.observedAt ?? null,
    actions: {
      configure: {
        allowed: ready,
        reason: ready
          ? null
          : "Оператор должен настроить tunnel-client и хранилище ключей для этого профиля.",
      },
      disconnect: {
        allowed: !!binding || !!record.credentialEnvelope,
        reason:
          binding || record.credentialEnvelope
            ? null
            : "Подключение ещё не настроено.",
      },
    },
  };
}
