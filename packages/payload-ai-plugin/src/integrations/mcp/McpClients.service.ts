/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/McpClients.service.ts
 * @version 1.1.0
 * @date 2026-09-25
 * @description Выдаёт, перевыпускает и отзывает MCP ключи с общим CAS и одноразовой выдачей.
 */
import { createHash, randomBytes } from "node:crypto";
import type {
  IssueMcpClientInput,
  McpOneTimeTokenDto,
} from "../../../../ai-contracts/src/McpServer.types";
import { EndpointError } from "../../endpoints/http";
import { relationID } from "../../endpoints/mappers";
import type { McpManagement } from "./McpManagement.service";
import { mapMcpClient } from "./mapMcpServer.mapper";
import { readMcpConfiguration } from "./validateMcpConfiguration.validator";
import { provisionMcpClient } from "./provisionMcpClient.service";

export class McpClients {
  constructor(private readonly management: McpManagement) {}
  async issue(
    serverID: string,
    input: IssueMcpClientInput,
  ): Promise<McpOneTimeTokenDto> {
    return this.management.mutate(
      serverID,
      "mcp_client_issued",
      input,
      async () => {
        const record = await this.management.requireRevision(
          serverID,
          input.expectedRevision,
        );
        const { client, token } = await provisionMcpClient(
          this.management,
          record,
          input,
        );
        await this.management.saveRevision(record);
        const result: McpOneTimeTokenDto = {
          client: mapMcpClient(
            client,
            String(this.management.context.actor.id),
          ),
          token,
          replayed: false,
          desiredRevision: input.expectedRevision + 1,
        };
        return {
          serverID,
          result,
          storedResult: { ...result, token: null },
          summary:
            "Выдан новый ключ MCP; доступ ожидает применения конфигурации.",
        };
      },
    );
  }

  async rotate(
    serverID: string,
    clientID: string,
    expectedRevision: number,
  ): Promise<McpOneTimeTokenDto> {
    return this.management.mutate(
      serverID,
      "mcp_client_rotated",
      { clientID, expectedRevision },
      async () => {
        const record = await this.management.requireRevision(
          serverID,
          expectedRevision,
        );
        const configuration = readMcpConfiguration(record.configuration);
        if (
          configuration.serverType === "realize-internal" &&
          configuration.chatgptTunnel?.clientID === clientID
        )
          throw new EndpointError(
            "FORBIDDEN",
            "Ключ ChatGPT обновляется в настройках подключения ChatGPT.",
            403,
          );
        const client = await this.management.repository.client(
          serverID,
          clientID,
        );
        if (
          relationID(client.createdBy) !==
            String(this.management.context.actor.id) ||
          client.revokedAt ||
          Date.parse(String(client.expiresAt)) <= Date.now()
        )
          throw new EndpointError(
            "FORBIDDEN",
            "Можно перевыпустить только собственный действующий ключ.",
            403,
          );
        const token = `mcp.${clientID}.${randomBytes(32).toString("base64url")}`;
        const updated = await this.management.repository.saveClient(
          {
            verifier: createHash("sha256").update(token).digest("hex"),
            revision: Number(client.revision) + 1,
          },
          client,
        );
        await this.management.saveRevision(record);
        const result: McpOneTimeTokenDto = {
          client: mapMcpClient(
            updated,
            String(this.management.context.actor.id),
          ),
          token,
          replayed: false,
          desiredRevision: expectedRevision + 1,
        };
        return {
          serverID,
          result,
          storedResult: { ...result, token: null },
          summary: "Ключ MCP перевыпущен; прежний credential отозван.",
        };
      },
    );
  }

  async revoke(serverID: string, clientID: string, expectedRevision: number) {
    return this.management.mutate(
      serverID,
      "mcp_client_revoked",
      { clientID, expectedRevision },
      async () => {
        const record = await this.management.requireRevision(
          serverID,
          expectedRevision,
        );
        const client = await this.management.repository.client(
          serverID,
          clientID,
        );
        if (!client.revokedAt)
          await this.management.repository.saveClient(
            {
              revokedAt: new Date().toISOString(),
              revision: Number(client.revision) + 1,
            },
            client,
          );
        await this.management.saveRevision(record);
        return {
          serverID,
          result: {
            server: await this.management.detail(serverID),
            replayed: false,
          },
          summary: "Ключ MCP отозван; следующие вызовы запрещены.",
        };
      },
    );
  }
}
