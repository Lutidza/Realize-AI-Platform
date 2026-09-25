/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/mcpEndpoints.controller.ts
 * @version 1.2.0
 * @date 2026-09-25
 * @description Принимает authenticated Admin команды MCP и выдаёт только явные DTO.
 */
import { z } from "zod";
import type { Endpoint } from "payload";
import { MCP_SERVER_DESCRIPTORS } from "../../../../ai-contracts/src/mcpServer.config";
import { mcpManagementInputs } from "../../../../ai-contracts/src/mcpManagementInputs.config";
import { DEFAULT_API_ROUTE } from "../../constants";
import { requireIntegrationManager } from "../../endpoints/access";
import { EndpointError, success } from "../../endpoints/http";
import { idempotencyKeyFor, withHandler } from "../../endpoints/request";
import { readMcpBody } from "./readMcpBody.adapter";
import type { SanitizedRealizeAIPluginOptions } from "../../types";
import { McpManagement } from "./McpManagement.service";
import { McpClients } from "./McpClients.service";
import { McpChatGpt } from "./McpChatGpt.service";
import { McpPresets } from "./McpPresets.service";
import {
  mapMcpHostProfile,
  readMcpHostProfiles,
} from "./readMcpHostProfiles.config";
import { probeMcpServer } from "./probeMcpServer.service";

const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new EndpointError(
      "INVALID_REQUEST",
      "Параметры MCP не соответствуют допустимой схеме.",
      400,
    );
  return result.data;
};
const identifier = (input: unknown) => parse(z.uuid(), input);

export function createMcpEndpoints(
  options: SanitizedRealizeAIPluginOptions,
): Endpoint[] {
  const root = `${DEFAULT_API_ROUTE}/mcp-servers`;
  const endpoint = (
    path: string,
    method: "get" | "post",
    work: (management: McpManagement) => Promise<unknown>,
  ): Endpoint => ({
    path: `${root}${path}`,
    method,
    handler: withHandler(async (req, correlationID) => {
      const actor = await requireIntegrationManager(req, options);
      const management = new McpManagement({
        req,
        actor,
        requestKey: method === "post" ? idempotencyKeyFor(req) : "read-only",
      });
      try {
        return success(await work(management), correlationID);
      } catch (error) {
        if (error instanceof EndpointError) throw error;
        // Драйверы и SDK могут включать connection URL в ошибку; наружу и в logger она не передаётся.
        throw new EndpointError(
          "INTEGRATION_UNAVAILABLE",
          "Операция MCP не завершена. Проверьте хранилище и повторите тот же запрос.",
          503,
        );
      }
    }),
  });
  const id = (management: McpManagement) =>
    identifier(management.context.req.routeParams?.serverID);
  const clientID = (management: McpManagement) =>
    identifier(management.context.req.routeParams?.clientID);
  const body = (management: McpManagement) =>
    readMcpBody(management.context.req);
  return [
    endpoint("/catalog", "get", async (management) => ({
      descriptors: MCP_SERVER_DESCRIPTORS.filter(
        (entry) => entry.serverType !== "mcp-http",
      ),
      profiles: readMcpHostProfiles().map(mapMcpHostProfile),
      presets: await new McpPresets(management).list(),
    })),
    endpoint("/install-defaults", "post", async (management) => {
      parse(z.strictObject({}), await body(management));
      return new McpPresets(management).install();
    }),
    endpoint("", "get", async (management) => {
      const url = new URL(management.context.req.url ?? "http://localhost");
      return management.list(
        parse(mcpManagementInputs.list, Object.fromEntries(url.searchParams)),
      );
    }),
    endpoint("", "post", async (management) =>
      management.create(
        parse(mcpManagementInputs.create, await body(management)),
      ),
    ),
    endpoint("/:serverID", "get", async (management) =>
      management.detail(id(management)),
    ),
    endpoint("/:serverID", "post", async (management) =>
      management.update(
        id(management),
        parse(mcpManagementInputs.update, await body(management)),
      ),
    ),
    endpoint("/:serverID/enabled", "post", async (management) =>
      management.enabled(
        id(management),
        parse(mcpManagementInputs.enabled, await body(management)),
      ),
    ),
    endpoint("/:serverID/apply", "post", async (management) =>
      management.apply(
        id(management),
        parse(mcpManagementInputs.revision, await body(management))
          .expectedRevision,
      ),
    ),
    ...(["test", "discover"] as const).map((action) =>
      endpoint(`/:serverID/${action}`, "post", async (management) =>
        probeMcpServer(
          management,
          id(management),
          parse(mcpManagementInputs.revision, await body(management))
            .expectedRevision,
          action === "discover",
        ),
      ),
    ),
    endpoint("/:serverID/clients", "post", async (management) =>
      new McpClients(management).issue(
        id(management),
        parse(mcpManagementInputs.issueClient, await body(management)),
      ),
    ),
    endpoint("/:serverID/chatgpt", "post", async (management) =>
      new McpChatGpt(management).save(
        id(management),
        parse(mcpManagementInputs.chatgpt, await body(management)),
      ),
    ),
    endpoint("/:serverID/chatgpt/disconnect", "post", async (management) =>
      new McpChatGpt(management).disconnect(
        id(management),
        parse(mcpManagementInputs.revision, await body(management))
          .expectedRevision,
      ),
    ),
    ...(["rotate", "revoke"] as const).map((action) =>
      endpoint(
        `/:serverID/clients/:clientID/${action}`,
        "post",
        async (management) =>
          new McpClients(management)[action](
            id(management),
            clientID(management),
            parse(mcpManagementInputs.revision, await body(management))
              .expectedRevision,
          ),
      ),
    ),
    endpoint("/:serverID/history", "get", async (management) => {
      const serverID = id(management);
      await management.repository.server(serverID);
      const page = parse(
        z.coerce.number().int().min(1).max(999999),
        new URL(
          management.context.req.url ?? "http://localhost",
        ).searchParams.get("page") ?? 1,
      );
      const result = await management.repository.events(serverID, page);
      return {
        items: result.docs.map((event) => ({
          id: String(event.id),
          action: String(event.action),
          status: event.status,
          summary: String(event.summary),
          createdAt: String(event.createdAt),
        })),
        page,
        limit: 25,
        totalDocs: result.totalDocs,
        totalPages: Math.ceil(result.totalDocs / 25),
      };
    }),
  ];
}
