/**
 * @file services/internal-mcp/src/createMcpRegistry.config.ts
 * @version 1.1.0
 * @date 2026-09-24
 * @description Регистрирует единую поверхность обеих protocol eras с повторной авторизацией вызова.
 */
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/server";
import { ZodError } from "zod";
import type { z } from "zod";
import { mcpToolInputs } from "../../../packages/ai-contracts/src/mcpToolInputs.config";
import {
  createMcpToolOutputSchema,
  mcpToolDataSchemas,
} from "../../../packages/ai-contracts/src/mcpToolOutputs.config";
import { RepositoryReadError } from "../../ai-control-plane/src/RepositoryRead.error";
import type { RepositoryCursorService } from "../../ai-control-plane/src/RepositoryCursor.service";
import { GitFailure } from "../../../.ai/tools/git-delivery/src/GitFailure.error";
import { executeMcpTool } from "./executeMcpTool.service";
import { availableMcpTools } from "./availableMcpTools.service";
import { mcpToolCatalog } from "./mcpToolCatalog.config";
import type { McpPrincipal, McpRuntimeOptions } from "./McpRuntime.types";
import type { McpCallBudget } from "./McpCallBudget.service";
import { McpError } from "./Mcp.error";

export function createMcpRegistry(
  principal: McpPrincipal,
  credential: string,
  options: McpRuntimeOptions,
  cursors: RepositoryCursorService,
  budget: McpCallBudget,
  stopping: AbortSignal,
): McpServer {
  const server = new McpServer(
    { name: "realize-internal-mcp", version: "1.1.0" },
    { supportedProtocolVersions: ["2026-07-28", "2025-11-25"] },
  );
  for (const name of availableMcpTools(principal, options)) {
    server.registerTool(
      name,
      {
        description: mcpToolCatalog[name].description,
        inputSchema: mcpToolInputs[name] as z.ZodType,
        outputSchema: createMcpToolOutputSchema(mcpToolDataSchemas[name]),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (input, call) => {
        const requestID = randomUUID();
        const started = Date.now();
        let release: (() => void) | undefined;
        let result;
        let code = "OK";
        try {
          const current = await options.authorize(credential);
          if (current.discoveryOnly)
            throw new McpError(
              "FORBIDDEN",
              "Этот credential разрешает только protocol discovery.",
            );
          if (
            current.principalID !== principal.principalID ||
            !availableMcpTools(current, options).includes(name)
          )
            throw new McpError("FORBIDDEN", "Вызов больше не разрешён.");
          release = budget.acquire(
            current.principalID,
            current.limits,
            name === "repo_search",
          );
          const signal = AbortSignal.any([
            stopping,
            call.mcpReq.signal,
            AbortSignal.timeout(name.startsWith("pages_") ? 15000 : 10000),
          ]);
          const data = await executeMcpTool(
            name,
            input,
            current,
            options,
            cursors,
            signal,
          );
          if (signal.aborted)
            throw new McpError(
              "TIMEOUT",
              "Чтение отменено или превысило срок.",
            );
          const parsed = mcpToolDataSchemas[name].parse(data);
          result = {
            content: [
              {
                type: "text" as const,
                text: "Чтение выполнено; структурированные данные приведены в structuredContent.",
              },
            ],
            structuredContent: {
              schemaVersion: "1.0",
              ok: true,
              data: parsed,
              requestID,
              observedAt: new Date().toISOString(),
            },
          };
          if (
            Buffer.byteLength(
              JSON.stringify({ jsonrpc: "2.0", id: call.mcpReq.id, result }),
            ) +
              1024 >
            current.limits.responseBytes
          )
            throw new McpError(
              "RESULT_LIMIT",
              "Ответ превышает лимит; сузьте запрос.",
            );
        } catch (error) {
          const known =
            error instanceof McpError || error instanceof RepositoryReadError;
          code = known
            ? error.code
            : error instanceof GitFailure
              ? error.category === "timeout"
                ? "TIMEOUT"
                : "DEPENDENCY_UNAVAILABLE"
              : error instanceof ZodError
                ? "INTERNAL_ERROR"
                : "INTERNAL_ERROR";
          const message = known
            ? error.message
            : code === "TIMEOUT"
              ? "Чтение превысило срок."
              : code === "DEPENDENCY_UNAVAILABLE"
                ? "Зависимость чтения недоступна."
                : "Не удалось выполнить чтение. Используйте идентификатор запроса.";
          result = {
            isError: true,
            content: [{ type: "text" as const, text: message }],
            structuredContent: {
              schemaVersion: "1.0",
              ok: false,
              error: {
                code,
                message,
                retryable: [
                  "CONFLICT",
                  "TIMEOUT",
                  "RATE_LIMITED",
                  "DEPENDENCY_UNAVAILABLE",
                ].includes(code),
              },
              requestID,
            },
          };
        } finally {
          release?.();
        }
        options.log?.({
          requestID,
          tool: name,
          code,
          durationMs: Date.now() - started,
          bytes: Buffer.byteLength(JSON.stringify(result)),
        });
        return result;
      },
    );
  }
  return server;
}
