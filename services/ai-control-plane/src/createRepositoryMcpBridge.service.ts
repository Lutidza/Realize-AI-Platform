/**
 * @file services/ai-control-plane/src/createRepositoryMcpBridge.service.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Предоставляет native child тот же bounded reader через существующий loopback MCP transport.
 * @see documentation/architecture/repository-search.md
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AgentReadTools } from "@realize/ai-contracts";
import { createMcpHttpServer } from "../../internal-mcp/src/createMcpHttpServer.controller";
import { McpError } from "../../internal-mcp/src/Mcp.error";
import type { RepositoryMcpBridge } from "./RepositoryMcpBridge.types";

/** Новый token и listener принадлежат одному run и закрываются после Codex process, до lease.dispose. */
export async function createRepositoryMcpBridge(
  tools: AgentReadTools,
  runID: string,
  signal: AbortSignal,
): Promise<RepositoryMcpBridge> {
  const token = randomBytes(32).toString("base64url");
  const verifier = createHash("sha256").update(token).digest();
  const allowedTools = [
    "repo_search",
    "repo_read_file",
    "repo_list_files",
  ] as const;
  if (
    tools.definitions.length !== 3 ||
    tools.definitions.some(
      (tool) => !allowedTools.some((name) => name === tool.name),
    )
  )
    throw new Error("repository_mcp_tools_invalid");
  const listener = await createMcpHttpServer({
    port: 0,
    repositoryTools: tools,
    authorize: async (provided) => {
      if (
        signal.aborted ||
        !timingSafeEqual(
          verifier,
          createHash("sha256").update(provided).digest(),
        )
      )
        throw new McpError("FORBIDDEN", "Run чтения недоступен.", 401);
      return {
        principalID: `admin:${runID}`,
        installationID: "isolated-chat-run",
        repositoryRead: true,
        pagesRead: false,
        allowedTools: [...allowedTools],
        limits: {
          callsPerMinute: 60,
          burst: 16,
          concurrentCalls: 1,
          responseBytes: 120 * 1024,
        },
      };
    },
  });
  return {
    url: `${listener.origin}/mcp`,
    environment: { REALIZE_CODEX_REPO_BRIDGE_AUTH: token },
    close: listener.close,
  };
}
