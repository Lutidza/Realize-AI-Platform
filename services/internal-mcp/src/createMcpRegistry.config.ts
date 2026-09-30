/**
 * @file services/internal-mcp/src/createMcpRegistry.config.ts
 * @version 1.3.0
 * @date 2026-09-27
 * @description Регистрирует единую поверхность обеих protocol eras с повторной авторизацией вызова.
 */
import {
  MCP_WORKSHOP_POLICY,
  mcpWorkshopImageResultSchema,
  type McpWorkshopToolName,
} from "@realize/ai-contracts";
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
import { buildSearchObservation } from "./buildSearchObservation.mapper";
import type { RepositorySearchMetrics } from "../../ai-control-plane/src/RepositoryQueries.types";

export function createMcpRegistry(
  principal: McpPrincipal,
  credential: string,
  options: McpRuntimeOptions,
  cursors: RepositoryCursorService,
  budget: McpCallBudget,
  stopping: AbortSignal,
): McpServer {
  const server = new McpServer(
    { name: "realize-internal-mcp", version: "1.2.0" },
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
          readOnlyHint: mcpToolCatalog[name].effect === "read",
          destructiveHint:
            name in MCP_WORKSHOP_POLICY
              ? MCP_WORKSHOP_POLICY[name as McpWorkshopToolName].destructive
              : false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (input, call) => {
        const requestID = randomUUID();
        const started = Date.now();
        const searchMetrics: RepositorySearchMetrics | undefined =
          name === "repo_search" && options.observeSearch
            ? {
                started: performance.now(),
                firstMatchMs: null,
                candidateFiles: null,
                filesRead: 0,
                bytesRead: 0,
                excludedFiles: 0,
              }
            : undefined;
        let effectiveResponseBytes = principal.limits.responseBytes;
        let release: (() => void) | undefined;
        let result;
        let code = "OK";
        try {
          const current = await options.authorize(credential);
          effectiveResponseBytes = current.limits.responseBytes;
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
            AbortSignal.timeout(
              name.startsWith("pages_") || name.startsWith("workshop_")
                ? 15000
                : 10000,
            ),
          ]);
          const data = await executeMcpTool(
            name,
            input,
            current,
            options,
            cursors,
            signal,
            searchMetrics,
          );
          if (signal.aborted)
            throw new McpError(
              "TIMEOUT",
              "Запрос прерван. Запись могла завершиться; повторите тот же idempotencyKey.",
            );
          const picture =
            name === "workshop_preview_image"
              ? mcpWorkshopImageResultSchema.parse(data)
              : null;
          const parsed = mcpToolDataSchemas[name].parse(
            picture ? picture.metadata : data,
          );
          result = {
            content: [
              ...(picture
                ? [
                    {
                      type: "image" as const,
                      mimeType: "image/jpeg",
                      data: picture.imageData,
                    },
                  ]
                : []),
              {
                type: "text" as const,
                text: "Операция выполнена; структурированные данные приведены в structuredContent.",
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
              ? "Запрос превысил срок. Для записи повторите тот же idempotencyKey."
              : code === "DEPENDENCY_UNAVAILABLE"
                ? "Зависимость инструмента недоступна."
                : "Не удалось выполнить запрос. Используйте идентификатор запроса.";
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
        if (searchMetrics) {
          try {
            options.observeSearch?.(
              buildSearchObservation(
                input,
                searchMetrics,
                result,
                requestID,
                new Date(started).toISOString(),
                code,
                effectiveResponseBytes,
              ),
            );
          } catch {
            /* Сбой наблюдателя не изменяет результат поиска. */
          }
        }
        return result;
      },
    );
  }
  return server;
}
