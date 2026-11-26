/**
 * @file .ai/tools/worker-assignment/src/admission/defineRepoReadFileTool.mapper.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Формирует объявление repo_read_file для API с перечислением путей в схеме параметров.
 */
import { mcpToolInputs } from "@realize/ai-contracts";
import { z } from "zod";

export function defineRepoReadFileTool(readPaths: string[]) {
  const parameters = z.toJSONSchema(
    mcpToolInputs.repo_read_file.extend({ path: z.enum(readPaths) }),
    { io: "input" },
  );
  return { type: "function", function: { name: "repo_read_file", parameters } };
}
