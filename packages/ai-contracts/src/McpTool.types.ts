/**
 * @file packages/ai-contracts/src/McpTool.types.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Выводит типы валидированных параметров инструментов MCP из единого schema owner.
 */
import type { z } from "zod";
import type { mcpToolInputs } from "./mcpToolInputs.config";
export type McpToolName = keyof typeof mcpToolInputs;
export type McpToolInput<Name extends McpToolName> = z.output<
  (typeof mcpToolInputs)[Name]
>;
