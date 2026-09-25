/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/McpPresets.service.ts
 * @version 1.0.0
 * @date 2026-09-24
 * @description Устанавливает отсутствующие MCP-предустановки, сохраняя настройки и audit владельца.
 * @see documentation/specifications/internal-mcp.md
 */
import {
  MCP_SERVER_PRESETS,
  type McpInstallPresetsDto,
  type McpServerPresetDto,
} from "@realize/ai-contracts";
import type { McpManagement } from "./McpManagement.service";
import { withMcpTransaction } from "./withMcpTransaction.service";
import { EndpointError } from "../../endpoints/http";

export class McpPresets {
  constructor(private readonly management: McpManagement) {}

  /** Чтение каталога не создаёт записи и не выдаёт приватную конфигурацию. */
  async list(): Promise<McpServerPresetDto[]> {
    return Promise.all(
      MCP_SERVER_PRESETS.map(async (preset) => ({
        id: preset.id,
        serverID: preset.serverID,
        displayName: preset.displayName,
        installed: !!(await this.existing(preset.serverID)),
      })),
    );
  }

  /** Вызывается только с проверенным manager context; pending profile допустим лишь у disabled preset. */
  async install(): Promise<McpInstallPresetsDto> {
    const result: McpInstallPresetsDto = {
      createdServerIDs: [],
      existingServerIDs: [],
    };
    for (const preset of MCP_SERVER_PRESETS) {
      const created = await withMcpTransaction(
        this.management.context.req,
        preset.serverID,
        async () => {
          if (await this.existing(preset.serverID)) return false;
          await this.management.mutate(
            preset.serverID,
            "mcp_created",
            { presetID: preset.id },
            async () => {
              await this.management.repository.integrations.save({
                provider: "mcp",
                category: "ai",
                connectionKey: `mcp:${preset.serverID}`,
                displayName: preset.displayName,
                configuration: structuredClone(preset.configuration),
                enabled: false,
                revision: 1,
                actorID: this.management.context.actor.id,
                lastTestStatus: "never",
              });
              return {
                serverID: preset.serverID,
                result: { serverID: preset.serverID, replayed: false },
                summary:
                  "Добавлен предустановленный MCP-сервер. Доступ отключён до настройки.",
              };
            },
          );
          return true;
        },
      );
      (created ? result.createdServerIDs : result.existingServerIDs).push(
        preset.serverID,
      );
    }
    return result;
  }

  private async existing(serverID: string) {
    const record =
      await this.management.repository.integrations.getByConnectionKey(
        `mcp:${serverID}`,
      );
    if (record && record.provider !== "mcp")
      throw new EndpointError(
        "CONFLICT",
        "Ключ предустановки занят другой интеграцией.",
        409,
      );
    return record;
  }
}
