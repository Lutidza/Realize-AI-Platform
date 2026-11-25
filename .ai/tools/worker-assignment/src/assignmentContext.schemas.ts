/**
 * @file .ai/tools/worker-assignment/src/assignmentContext.schemas.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Задаёт версию локальной записи, структуру поручения и конфигурацию адаптера аудита.
 */
import { z } from "zod";

export const storedContextSchema = z.strictObject({
  version: z.literal(1),
  adapter: z.literal("static-read-only"),
  contextId: z.uuidv4(),
  assignmentId: z.string(),
  revision: z.number().int(),
  lockSha256: z.string(),
  initialInput: z.unknown(),
  access: z.unknown(),
});
export const initialInputSchema = z.strictObject({
  assignment: z.unknown(),
  sources: z.array(z.strictObject({ path: z.string(), text: z.string() })),
});
export const readOnlyAccessSchema = z.strictObject({
  readPins: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  tools: z.tuple([z.literal("repo_read_file")]),
  writePaths: z.tuple([]),
});
