/**
 * @file services/ai-control-plane/src/readAiInstructions.service.ts
 * @version 1.0.0
 * @date 2026-09-24
 * @description Читает точные порции инструкции с проверкой ожидаемого hash и существующей FS policy.
 * @see documentation/specifications/internal-mcp.md
 */
import type { McpToolInput } from "../../../packages/ai-contracts/src/McpTool.types";
import type { RepositoryQueryContext } from "./RepositoryQueries.types";
import { validateAiInstructionPath } from "./aiInstructionPolicy.validator";
import { readRepositoryLines } from "./readRepositoryLines.service";

/** Текст остаётся данными источника и не выдаёт permissions вызывающему клиенту. */
export async function readAiInstructions(
  context: RepositoryQueryContext,
  input: McpToolInput<"ai_instructions_get">,
) {
  const classification = validateAiInstructionPath(context.policy, input.path);
  const window = await readRepositoryLines(context, input);
  return {
    ...window,
    authority: classification.authority,
    authorityOrigin: "server_path_policy" as const,
    grantsPermissions: false as const,
  };
}
