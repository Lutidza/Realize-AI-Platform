/**
 * @file .ai/tools/worker-assignment/src/admission/articleReaderTool.mapper.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Формирует декларацию reader для запроса API из схемы действующего обработчика.
 */
import { mcpToolInputs } from "@realize/ai-contracts";
import { z } from "zod";

export function articleReaderTool(paths: string[]) {
  const parameters = z.toJSONSchema(
    mcpToolInputs.repo_read_file.extend({ path: z.enum(paths) }),
    { io: "input" },
  );
  return { type: "function", function: { name: "repo_read_file", parameters } };
}
