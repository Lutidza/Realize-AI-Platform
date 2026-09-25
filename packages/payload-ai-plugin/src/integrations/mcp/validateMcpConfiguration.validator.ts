/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/validateMcpConfiguration.validator.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Сужает конфигурацию MCP operator ceilings и отказывает неподключённым adapters.
 */
import type { McpServerConfiguration } from "../../../../ai-contracts/src/McpServer.types";
import { mcpConfigurationSchema } from "../../../../ai-contracts/src/mcpManagementInputs.config";
import { EndpointError } from "../../endpoints/http";
import { readMcpHostProfiles } from "./readMcpHostProfiles.config";

export function readMcpConfiguration(value: unknown): McpServerConfiguration {
  const result = mcpConfigurationSchema.safeParse(value);
  if (!result.success)
    throw new EndpointError(
      "INTEGRATION_UNAVAILABLE",
      "Сохранённая конфигурация MCP недопустима.",
      503,
    );
  return result.data;
}

export function validateMcpConfiguration(
  configuration: McpServerConfiguration,
): void {
  if (configuration.serverType === "mcp-http")
    throw new EndpointError(
      "INVALID_REQUEST",
      "Внешний HTTP adapter ещё не подключён; используйте поддержанный тип.",
      400,
    );
  if (configuration.serverType !== "realize-internal") return;
  const profile = readMcpHostProfiles().find(
    (entry) => entry.id === configuration.hostProfileID,
  );
  if (!profile || !profile.allowedPorts.includes(configuration.port))
    throw new EndpointError(
      "FORBIDDEN",
      "Host profile или port не разрешён оператором.",
      403,
    );
  for (const key of Object.keys(
    configuration.limits,
  ) as (keyof typeof configuration.limits)[]) {
    if (configuration.limits[key] > profile.maximumLimits[key])
      throw new EndpointError(
        "FORBIDDEN",
        "Лимит превышает operator ceiling.",
        403,
      );
  }
}
