/**
 * @file .ai/tools/worker-assignment/src/validateAssignmentInventory.validator.ts
 * @version 1.0.1
 * @date 2026-11-25
 * @description Сверяет полный MCP-каталог с одним reader и множеством путей назначения.
 */
import { z } from "zod";
import { matchesAssignmentReaderPaths } from "./matchesAssignmentReaderPaths.validator";

const reader = z.object({
  name: z.literal("repo_read_file"),
  inputSchema: z.unknown(),
});
const inventory = z.object({
  nextCursor: z.null(),
  data: z.tuple([
    z.object({
      name: z.literal("realize_assignment"),
      runtimeStatus: z.literal("connected"),
      toolsError: z.null(),
      resources: z.tuple([]),
      resourceTemplates: z.tuple([]),
      tools: z.strictObject({ repo_read_file: reader }),
    }),
  ]),
});

/** Дубликат, лишний сервер, страницы или широкий path не дают положительного результата. */
export function validateAssignmentInventory(
  value: unknown,
  paths: readonly string[],
) {
  const parsed = inventory.safeParse(value);
  if (!parsed.success) return false;
  const schema = parsed.data.data[0].tools.repo_read_file.inputSchema;
  return matchesAssignmentReaderPaths(schema, paths);
}
