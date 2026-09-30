/**
 * @file packages/ai-contracts/src/McpWorkshop.types.ts
 * @version 1.0.0
 * @date 2026-09-26
 * @description Выводит типы доверенной identity и bounded MCP изображений.
 * @see documentation/specifications/design-workshop.md
 */
import type { z } from "zod";
import type { MCP_WORKSHOP_POLICY } from "./mcpWorkshop.config";
import type {
  mcpWorkshopIdentitySchema,
  mcpWorkshopImageResultSchema,
} from "./mcpWorkshop.schemas";
export type McpWorkshopToolName = keyof typeof MCP_WORKSHOP_POLICY;
export type McpWorkshopIdentity = z.infer<typeof mcpWorkshopIdentitySchema>;
export type McpWorkshopImageResult = z.infer<
  typeof mcpWorkshopImageResultSchema
>;
