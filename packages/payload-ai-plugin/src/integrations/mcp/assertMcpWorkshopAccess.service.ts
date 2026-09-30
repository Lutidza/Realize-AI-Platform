/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/assertMcpWorkshopAccess.service.ts
 * @version 1.0.0
 * @date 2026-09-26
 * @description Проверяет текущие и применённые права исходного MCP клиента без сохранения credential.
 * @see documentation/specifications/design-workshop.md
 */
import type { PayloadRequest } from "payload";
import {
  MCP_WORKSHOP_POLICY,
  mcpWorkshopIdentitySchema,
  type McpWorkshopIdentity,
  type McpWorkshopToolName,
  type McpClientGrants,
} from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import { EndpointError } from "../../endpoints/http";
import { relationID } from "../../endpoints/mappers";
import { McpRepository } from "./Mcp.repository";
import { readMcpConfiguration } from "./validateMcpConfiguration.validator";
import { readMcpHostProfiles } from "./readMcpHostProfiles.config";
import type { McpAppliedSnapshot } from "./McpPersistence.types";

/** Вызывается под instance lock при записи; worker повторяет проверку при каждом lease renewal. */
export async function assertMcpWorkshopAccess(
  req: PayloadRequest,
  identity: McpWorkshopIdentity,
  tool: McpWorkshopToolName,
): Promise<void> {
  const parsed = mcpWorkshopIdentitySchema.safeParse(identity);
  const denied = () =>
    new EndpointError(
      "FORBIDDEN",
      "Доступ клиента к Мастерской отозван или не применён.",
      403,
    );
  if (!parsed.success || !req.user) throw denied();
  const repository = new McpRepository(req);
  const server = await repository.server(identity.serverID);
  const client = await repository.client(identity.serverID, identity.clientID);
  const receipt = await repository.receipt(identity.serverID);
  const config = readMcpConfiguration(server.configuration);
  if (config.serverType !== "realize-internal") throw denied();
  const profile = readMcpHostProfiles().find(
    (p) => p.id === config.hostProfileID,
  );
  const applied = receipt?.appliedSnapshot as McpAppliedSnapshot | null;
  const accepted = applied?.clients.find(
    (c) => c.clientID === identity.clientID,
  );
  const grants = client.grants as McpClientGrants;
  const permission = MCP_WORKSHOP_POLICY[tool].grant;
  if (
    !profile?.workshop ||
    !server.enabled ||
    client.revokedAt ||
    Date.parse(String(client.expiresAt)) <= Date.now() ||
    client.revision !== identity.clientRevision ||
    relationID(client.actor) !== String(req.user.id) ||
    !applied ||
    receipt?.configHash !== hashCanonicalJSON(applied) ||
    applied.serverID !== identity.serverID ||
    !applied.enabled ||
    applied.configuration.hostProfileID !== config.hostProfileID ||
    applied.configuration.port !== config.port ||
    accepted?.revision !== identity.clientRevision ||
    accepted.actorID !== String(req.user.id) ||
    grants.workshopRead !== true ||
    accepted.grants.workshopRead !== true ||
    grants[permission] !== true ||
    accepted.grants[permission] !== true ||
    !config.allowedTools.includes(tool) ||
    !applied.configuration.allowedTools.includes(tool)
  )
    throw denied();
}
