/**
 * @file services/internal-mcp/src/McpRepositoryContext.types.ts
 * @version 1.0.0
 * @date 2026-10-20
 * @description Выводит диагностику файлов и Git из публичной схемы context.
 */
import type { z } from "zod";
import type { mcpToolDataSchemas } from "../../../packages/ai-contracts/src/mcpToolOutputs.config";

export type McpRepositoryContext = Pick<
  z.output<typeof mcpToolDataSchemas.realize_get_context>,
  "repository" | "modules"
>;
