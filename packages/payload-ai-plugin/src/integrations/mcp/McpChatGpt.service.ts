/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/McpChatGpt.service.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Сохраняет и отключает ChatGPT с атомарным обновлением credential, client и revision.
 * @see documentation/specifications/internal-mcp.md
 */
import type { SaveMcpChatGptInput } from "../../../../ai-contracts/src/McpChatGpt.types";
import type { McpManagement } from "./McpManagement.service";
import { EndpointError } from "../../endpoints/http";
import { readMcpConfiguration } from "./validateMcpConfiguration.validator";
import { provisionMcpClient } from "./provisionMcpClient.service";
import { McpChatGptCredentials } from "./McpChatGptCredentials.service";

export class McpChatGpt {
  constructor(private readonly management: McpManagement) {}

  async save(serverID: string, input: SaveMcpChatGptInput) {
    const management = this.management;
    return management.mutate(
      serverID,
      "mcp_updated",
      { operation: "chatgpt_save", ...input },
      async () => {
        const record = await management.requireRevision(
          serverID,
          input.expectedRevision,
        );
        const configuration = readMcpConfiguration(record.configuration);
        const detail = await management.detail(serverID);
        if (
          configuration.serverType !== "realize-internal" ||
          !detail.chatgpt?.actions.configure.allowed
        )
          throw new EndpointError(
            "FORBIDDEN",
            detail.chatgpt?.actions.configure.reason ??
              "Подключение ChatGPT недоступно.",
            403,
          );
        if (!record.enabled)
          throw new EndpointError(
            "INVALID_REQUEST",
            "Сначала включите MCP-сервер.",
            400,
          );
        const credentials = new McpChatGptCredentials(
          management.context.req.payload,
        );
        const apiKey = input.apiKey ?? credentials.read(record)?.apiKey;
        if (!apiKey)
          throw new EndpointError(
            "INVALID_REQUEST",
            "Введите ключ OpenAI для первого подключения.",
            400,
          );
        const existing = configuration.chatgptTunnel
          ? await management.repository.client(
              serverID,
              configuration.chatgptTunnel.clientID,
            )
          : undefined;
        const { client, token } = await provisionMcpClient(
          management,
          record,
          {
            expectedRevision: input.expectedRevision,
            displayName: "ChatGPT · Secure Tunnel",
            grants: input.grants,
            actorBinding: input.grants.pagesRead ? "self" : "none",
            expiresAt: input.expiresAt,
          },
          existing,
        );
        await management.saveRevision(record, {
          configuration: {
            ...configuration,
            chatgptTunnel: {
              tunnelID: input.tunnelID,
              clientID: String(client.clientID),
            },
          },
          credentialEnvelope: credentials.seal(serverID, {
            apiKey,
            mcpToken: token,
          }),
          credentialUpdatedAt: new Date().toISOString(),
        });
        await management.repository.saveReceipt(serverID, {
          requestedRevision: input.expectedRevision + 1,
          status: "pending",
          reason: "Ожидается применение настроек ChatGPT.",
        });
        return {
          serverID,
          result: {
            server: await management.detail(serverID),
            replayed: false,
          },
          summary:
            "Настройки ChatGPT сохранены; ключи зашифрованы, применение запрошено.",
        };
      },
    );
  }

  async disconnect(serverID: string, expectedRevision: number) {
    const management = this.management;
    return management.mutate(
      serverID,
      "mcp_updated",
      { operation: "chatgpt_disconnect", expectedRevision },
      async () => {
        const record = await management.requireRevision(
          serverID,
          expectedRevision,
        );
        const configuration = readMcpConfiguration(record.configuration);
        if (configuration.serverType !== "realize-internal")
          throw new EndpointError(
            "INVALID_REQUEST",
            "Этот adapter не поддерживает ChatGPT.",
            400,
          );
        if (configuration.chatgptTunnel) {
          const client = await management.repository.client(
            serverID,
            configuration.chatgptTunnel.clientID,
          );
          await management.repository.saveClient(
            {
              revokedAt: new Date().toISOString(),
              revision: Number(client.revision) + 1,
            },
            client,
          );
        }
        const next = { ...configuration };
        delete next.chatgptTunnel;
        await management.saveRevision(record, {
          configuration: next,
          credentialEnvelope: null,
          credentialUpdatedAt: null,
        });
        await management.repository.saveReceipt(serverID, {
          requestedRevision: expectedRevision + 1,
          status: "pending",
        });
        return {
          serverID,
          result: {
            server: await management.detail(serverID),
            replayed: false,
          },
          summary:
            "ChatGPT отключён; credential удалён, локальный ключ отозван.",
        };
      },
    );
  }
}
