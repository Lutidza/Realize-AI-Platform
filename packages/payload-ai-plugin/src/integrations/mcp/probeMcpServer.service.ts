/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/probeMcpServer.service.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Проверяет hosted MCP официальным клиентом без вызова обнаруженных инструментов.
 */
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { hashCanonicalJSON } from "@realize/change-engine";
import type { McpProbeResultDto } from "../../../../ai-contracts/src/McpServer.types";
import type { McpManagement } from "./McpManagement.service";
import { EndpointError } from "../../endpoints/http";
import {
  readMcpConfiguration,
  validateMcpConfiguration,
} from "./validateMcpConfiguration.validator";
import { readMcpHostProfiles } from "./readMcpHostProfiles.config";

/** URL фиксирован на IP loopback и разрешённом port; redirect запрещён до передачи service credential. */
export async function probeMcpServer(
  management: McpManagement,
  serverID: string,
  expectedRevision: number,
  discover: boolean,
): Promise<McpProbeResultDto> {
  const replayed = await management.replay<McpProbeResultDto>(
    serverID,
    discover ? "mcp_discovered" : "tested",
    { expectedRevision },
  );
  if (replayed) return replayed;
  const server = await management.requireRevision(serverID, expectedRevision);
  const configuration = readMcpConfiguration(server.configuration);
  validateMcpConfiguration(configuration);
  if (configuration.serverType !== "realize-internal")
    throw new EndpointError(
      "FORBIDDEN",
      "Этот adapter не предоставляет protocol probe.",
      403,
    );
  const profile = readMcpHostProfiles().find(
    (entry) => entry.id === configuration.hostProfileID,
  );
  const token = profile && process.env[profile.controlTokenEnv];
  if (!profile || !token)
    throw new EndpointError(
      "INTEGRATION_UNAVAILABLE",
      "Control credential не настроен оператором.",
      503,
    );
  const endpoint = new URL(`http://127.0.0.1:${configuration.port}/mcp`);
  const client = new Client(
    { name: "realize-management-probe", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  const signal = AbortSignal.timeout(10000);
  const result: McpProbeResultDto = {
    serverID,
    checkedRevision: expectedRevision,
    checkedAt: new Date().toISOString(),
    status: "failed",
    message:
      "Не удалось подтвердить MCP. Проверьте процесс, port и operator credential.",
    tools: [],
    replayed: false,
  };
  try {
    await client.connect(
      new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
        fetch: async (input, init) => {
          const url = typeof input === "string" ? new URL(input) : input;
          if (url.href !== endpoint.href)
            throw new Error("Probe destination is not permitted.");
          const response = await fetch(input, {
            ...init,
            redirect: "error",
            signal: AbortSignal.any([
              signal,
              ...(init?.signal ? [init.signal] : []),
            ]),
          });
          const reader = response.body?.getReader();
          if (!reader) return response;
          const chunks: Uint8Array[] = [];
          let size = 0;
          try {
            while (true) {
              const read = await reader.read();
              if (read.done) break;
              size += read.value.byteLength;
              if (size > 131072) throw new Error("Probe response limit.");
              chunks.push(read.value);
            }
          } finally {
            await reader.cancel();
          }
          return new Response(Buffer.concat(chunks), {
            status: response.status,
            headers: response.headers,
          });
        },
      }),
    );
    const catalog = await client.listTools();
    if (
      catalog.nextCursor ||
      catalog.tools.length > 100 ||
      client.getProtocolEra() !== "modern"
    )
      throw new Error("Unsupported discovery result.");
    result.tools = catalog.tools.map((tool) => {
      if (
        tool.name.length > 128 ||
        Buffer.byteLength(JSON.stringify(tool.inputSchema)) > 32768
      )
        throw new Error("Schema limit.");
      return {
        name: tool.name,
        description: (tool.description ?? "").slice(0, 1000),
        schemaHash: hashCanonicalJSON(tool.inputSchema),
        inputSchema: tool.inputSchema,
        approved: configuration.allowedTools.includes(tool.name),
      };
    });
    result.status = "passed";
    result.message =
      "Подтверждены MCP 2026-07-28 и каталог инструментов; инструменты не вызывались.";
  } catch {
    /* Внешняя ошибка может содержать request headers; сохраняем только подготовленное сообщение. */
  } finally {
    await client.close().catch(() => undefined);
  }
  return management.mutate(
    serverID,
    discover ? "mcp_discovered" : "tested",
    { expectedRevision },
    async () => {
      const current = await management.requireRevision(
        serverID,
        expectedRevision,
      );
      await management.repository.integrations.recordTest({
        connection: current,
        status: result.status,
        testedAt: result.checkedAt,
        ...(result.status === "failed"
          ? { errorCode: "MCP_PROBE_FAILED" }
          : {}),
      });
      if (result.status === "passed")
        await management.repository.saveReceipt(serverID, {
          discoveredTools: result.tools,
          discoveredRevision: expectedRevision,
        });
      return {
        serverID,
        result,
        summary: result.message,
        status: result.status,
      };
    },
  );
}
