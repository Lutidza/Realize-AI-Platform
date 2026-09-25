/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/McpChatGptRuntime.service.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Выдаёт supervisor только применённый binding и принимает наблюдение текущего boot/revision.
 */
import { createLocalReq, type Payload } from "payload";
import { hashCanonicalJSON } from "@realize/change-engine";
import type { McpChatGptObservation } from "../../../../ai-contracts/src/McpChatGpt.types";
import type { McpAppliedSnapshot } from "./McpPersistence.types";
import type {
  McpChatGptLaunchPlan,
  McpChatGptRuntimePort,
} from "./McpChatGptRuntime.types";
import type { McpRuntime } from "./McpRuntime.service";
import { McpRepository } from "./Mcp.repository";
import { withMcpTransaction } from "./withMcpTransaction.service";
import { readMcpConfiguration } from "./validateMcpConfiguration.validator";
import { McpChatGptCredentials } from "./McpChatGptCredentials.service";

export class McpChatGptRuntime implements McpChatGptRuntimePort {
  constructor(
    private readonly payload: Payload,
    private readonly runtime: McpRuntime,
  ) {}

  async read(): Promise<McpChatGptLaunchPlan> {
    const req = await createLocalReq({}, this.payload);
    const plan = await withMcpTransaction(
      req,
      this.runtime.serverID,
      async (): Promise<McpChatGptLaunchPlan> => {
        const repository = new McpRepository(req);
        const record = await repository.server(this.runtime.serverID);
        const revision = Number(record.revision);
        const configuration = readMcpConfiguration(record.configuration);
        if (
          configuration.serverType !== "realize-internal" ||
          !configuration.chatgptTunnel ||
          !record.enabled
        )
          return { revision, status: "disabled" };
        const receipt = await repository.receipt(this.runtime.serverID);
        const applied = receipt?.appliedSnapshot as McpAppliedSnapshot | null;
        if (
          receipt?.bootID !== this.runtime.bootID ||
          receipt.hostProfileID !== this.runtime.profile.id ||
          receipt.appliedRevision !== revision ||
          !applied ||
          receipt.configHash !== hashCanonicalJSON(applied) ||
          applied.revision !== revision ||
          applied.serverID !== this.runtime.serverID ||
          !applied.enabled ||
          hashCanonicalJSON(applied.configuration) !==
            hashCanonicalJSON(configuration) ||
          configuration.hostProfileID !== this.runtime.profile.id ||
          configuration.port !== this.runtime.port
        )
          return { revision, status: "pending" };
        const executable = this.runtime.profile.tunnelClientPath;
        if (!executable) return { revision, status: "failed" };
        try {
          const keys = new McpChatGptCredentials(this.payload).read(record);
          if (
            !keys ||
            !keys.mcpToken.startsWith(
              `mcp.${configuration.chatgptTunnel.clientID}.`,
            )
          )
            return { revision, status: "failed" };
          return {
            revision,
            status: "starting",
            connection: {
              executable,
              port: this.runtime.port,
              tunnelID: configuration.chatgptTunnel.tunnelID,
              ...keys,
            },
          };
        } catch {
          return { revision, status: "failed" };
        }
      },
    );
    if (plan.connection) {
      try {
        const principal = await this.runtime.authorize(
          plan.connection.mcpToken,
        );
        if (!principal.repositoryRead && !principal.pagesRead)
          return { revision: plan.revision, status: "failed" };
      } catch {
        return { revision: plan.revision, status: "failed" };
      }
    }
    return plan;
  }

  /** Позднее наблюдение не может подтвердить другую revision или новый boot. */
  async report(
    revision: number,
    status: McpChatGptObservation["status"],
  ): Promise<void> {
    const req = await createLocalReq({}, this.payload);
    await withMcpTransaction(req, this.runtime.serverID, async () => {
      const repository = new McpRepository(req);
      const record = await repository.server(this.runtime.serverID);
      const receipt = await repository.receipt(this.runtime.serverID);
      if (
        record.revision !== revision ||
        receipt?.bootID !== this.runtime.bootID ||
        receipt.hostProfileID !== this.runtime.profile.id
      )
        return;
      await repository.saveReceipt(this.runtime.serverID, {
        chatgptTunnel: {
          revision,
          status,
          observedAt: new Date().toISOString(),
        },
      });
    });
  }
}
