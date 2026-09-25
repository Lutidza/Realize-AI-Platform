/**
 * @file packages/ai-contracts/src/aiInstructionInputs.config.ts
 * @version 1.0.0
 * @date 2026-09-24
 * @description Задаёт ограниченные входы чтения контекста и инструкций S1.
 * @see documentation/specifications/internal-mcp.md
 */
import { z } from "zod";

export const aiContextInputSchema = z.strictObject({
  description: z.string().trim().min(1).max(2000),
  kind: z
    .enum(["general", "frontend", "backend", "documentation", "system"])
    .default("general"),
  targetPaths: z.array(z.string().min(1).max(4096)).max(12).default([]),
  entrypoints: z.array(z.string().min(1).max(4096)).max(8).default([]),
  maxSources: z.number().int().min(16).max(96).default(64),
});
