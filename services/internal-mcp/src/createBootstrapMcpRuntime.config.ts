/**
 * @file services/internal-mcp/src/createBootstrapMcpRuntime.config.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Проверяет явный repository-only bootstrap без Payload, dotenv и offline grants.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { isAbsolute } from "node:path";
import {
  MCP_DEFAULT_LIMITS,
  MCP_REALIZE_TOOLS,
} from "../../../packages/ai-contracts/src/mcpServer.config";
import { createRepositoryReadPolicy } from "../../ai-control-plane/src/repositoryReadPolicy.validator";
import { RepositoryCursorService } from "../../ai-control-plane/src/RepositoryCursor.service";
import { readGitMetadata } from "../../../.ai/tools/git-delivery/src/read/readGitMetadata.adapter";
import type { McpRuntimeOptions } from "./McpRuntime.types";
import { McpError } from "./Mcp.error";

export async function createBootstrapMcpRuntime(
  env: NodeJS.ProcessEnv,
): Promise<McpRuntimeOptions> {
  const fail = () =>
    new McpError("INVALID_INPUT", "Некорректная bootstrap-конфигурация MCP.");
  if (
    env.REALIZE_MCP_CONFIGURATION_MODE !== "bootstrap" ||
    env.REALIZE_MCP_REPOSITORY_READ_ENABLED !== "true" ||
    env.REALIZE_MCP_SERVER_ID ||
    env.REALIZE_MCP_PAGES_READ_ENABLED ||
    env.REALIZE_MCP_PAYLOAD_USER_ID
  )
    throw fail();
  const credential = env.REALIZE_MCP_TOKEN ?? "";
  const root = env.REALIZE_MCP_REPOSITORY_ROOT ?? "";
  const principalID = env.REALIZE_MCP_PRINCIPAL_ID ?? "";
  const port = Number(env.REALIZE_MCP_PORT ?? "4319");
  if (
    !/^[A-Za-z0-9_-]{43,256}$/.test(credential) ||
    Buffer.from(credential, "base64url").length < 32 ||
    !isAbsolute(root) ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(principalID) ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  )
    throw fail();
  const policy = await createRepositoryReadPolicy(root, true);
  await readGitMetadata({
    policy,
    principal: principalID,
    cursors: new RepositoryCursorService(),
    signal: AbortSignal.timeout(10000),
  });
  const verifier = createHash("sha256").update(credential).digest();
  return {
    port,
    policy,
    authorize: async (token) => {
      if (
        !timingSafeEqual(verifier, createHash("sha256").update(token).digest())
      )
        throw new McpError("FORBIDDEN", "Credential недействителен.", 401);
      return {
        principalID,
        installationID: "bootstrap",
        repositoryRead: true,
        pagesRead: false,
        allowedTools: MCP_REALIZE_TOOLS.filter(
          (name) => !name.startsWith("pages_"),
        ),
        limits: { ...MCP_DEFAULT_LIMITS },
      };
    },
  };
}
