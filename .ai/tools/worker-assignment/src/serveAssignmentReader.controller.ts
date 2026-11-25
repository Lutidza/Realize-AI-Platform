/**
 * @file .ai/tools/worker-assignment/src/serveAssignmentReader.controller.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Открывает один сохранённый контекст и публикует его ограниченный reader по stdio MCP.
 */
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { mcpToolInputs } from "@realize/ai-contracts";
import { z } from "zod";
import { RepositoryReadError } from "../../../../services/ai-control-plane/src/RepositoryRead.error";
import { createRepositoryReadPolicy } from "../../../../services/ai-control-plane/src/repositoryReadPolicy.validator";
import { bindAssignment } from "./bindAssignment.service";

const [root, lock, contextId, lockSha256] = process.argv.slice(2);
if (!root || !lock || !contextId || !lockSha256)
  throw new Error("Отсутствует привязка контекста.");
const binding = await bindAssignment(
  await createRepositoryReadPolicy(root, true),
  lock,
  contextId,
);
if (!binding.context || binding.report.lockSha256 !== lockSha256)
  throw new Error("Привязка недоступна.");
const { callTool } = binding.context;
const paths = binding.report.effectiveAccess.readPaths;
const name = "repo_read_file";
const inputSchema = mcpToolInputs.repo_read_file.extend({
  path: z.enum(paths),
});
serveStdio(() => {
  const server = new McpServer(
    { name: "realize-assignment", version: "1.0.0" },
    { supportedProtocolVersions: ["2026-07-28", "2025-11-25"] },
  );
  server.registerTool(
    name,
    {
      description: "Читает закреплённые строки файла назначения.",
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const read = await callTool(name, args);
        return {
          content: [{ type: "text", text: JSON.stringify(read) }],
          structuredContent: read,
        };
      } catch (error) {
        if (!(error instanceof RepositoryReadError)) throw error;
        return { isError: true, content: [{ type: "text", text: error.code }] };
      }
    },
  );
  return server;
});
