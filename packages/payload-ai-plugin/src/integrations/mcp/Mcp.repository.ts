/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/Mcp.repository.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Читает MCP instances через общий integration registry и закрытые client/receipt коллекции.
 */
import type { PayloadRequest } from "payload";
import { INTEGRATIONS_SLUG, INTEGRATION_EVENTS_SLUG } from "../../constants";
import { MCP_CLIENTS_SLUG } from "../../collections/McpClients.collection";
import { MCP_RUNTIME_SLUG } from "../../collections/McpRuntimeReceipts.collection";
import { IntegrationRepository } from "../../endpoints/integrationRepository";
import type { IntegrationLocalAPI } from "../../endpoints/IntegrationRepository.types";
import type { AIDocument } from "../../endpoints/repository";
import { EndpointError } from "../../endpoints/http";

export class McpRepository {
  readonly integrations: IntegrationRepository;
  private readonly api: IntegrationLocalAPI;
  constructor(private readonly req: PayloadRequest) {
    this.api = req.payload as unknown as IntegrationLocalAPI;
    this.integrations = new IntegrationRepository(req.payload, req);
  }
  async server(serverID: string): Promise<AIDocument> {
    const server = await this.integrations.getByConnectionKey(
      `mcp:${serverID}`,
    );
    if (!server || server.provider !== "mcp")
      throw new EndpointError("NOT_FOUND", "MCP-сервер не найден.", 404);
    return server;
  }
  async servers(where: Record<string, unknown>, page: number, limit: number) {
    return this.api.find({
      collection: INTEGRATIONS_SLUG,
      where: { and: [{ provider: { equals: "mcp" } }, where] },
      depth: 0,
      overrideAccess: true,
      req: this.req,
      page,
      limit,
      sort: "displayName",
    });
  }
  async clients(serverID: string): Promise<AIDocument[]> {
    const result = await this.find(
      MCP_CLIENTS_SLUG,
      { serverID: { equals: serverID } },
      101,
    );
    if (result.docs.length > 100)
      throw new EndpointError(
        "CONFLICT",
        "Превышен лимит записей клиентов экземпляра.",
        409,
      );
    return result.docs;
  }
  async client(serverID: string, clientID: string): Promise<AIDocument> {
    const found = await this.find(
      MCP_CLIENTS_SLUG,
      {
        and: [
          { serverID: { equals: serverID } },
          { clientID: { equals: clientID } },
        ],
      },
      1,
    );
    if (!found.docs[0])
      throw new EndpointError("NOT_FOUND", "Клиент не найден.", 404);
    return found.docs[0];
  }
  async saveClient(
    data: Record<string, unknown>,
    existing?: AIDocument,
  ): Promise<AIDocument> {
    if (!existing)
      return this.api.create({
        collection: MCP_CLIENTS_SLUG,
        data,
        overrideAccess: true,
        req: this.req,
      });
    return (await this.api.update({
      collection: MCP_CLIENTS_SLUG,
      id: existing.id,
      data,
      overrideAccess: true,
      req: this.req,
    })) as AIDocument;
  }
  async receipt(serverID: string): Promise<AIDocument | undefined> {
    return (
      await this.find(MCP_RUNTIME_SLUG, { serverID: { equals: serverID } }, 1)
    ).docs[0];
  }
  async saveReceipt(
    serverID: string,
    data: Record<string, unknown>,
  ): Promise<AIDocument> {
    const record = await this.receipt(serverID);
    if (!record)
      return this.api.create({
        collection: MCP_RUNTIME_SLUG,
        data: { serverID, ...data },
        overrideAccess: true,
        req: this.req,
      });
    return (await this.api.update({
      collection: MCP_RUNTIME_SLUG,
      id: record.id,
      data,
      overrideAccess: true,
      req: this.req,
    })) as AIDocument;
  }
  async events(serverID: string, page: number, limit = 25) {
    return this.api.find({
      collection: INTEGRATION_EVENTS_SLUG,
      where: {
        and: [
          { provider: { equals: "mcp" } },
          { connectionKey: { equals: `mcp:${serverID}` } },
        ],
      },
      depth: 0,
      overrideAccess: true,
      req: this.req,
      page,
      limit,
      sort: "-createdAt",
    });
  }
  private find(
    collection: string,
    where: Record<string, unknown>,
    limit: number,
  ) {
    return this.api.find({
      collection,
      where,
      limit,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req: this.req,
    });
  }
}
