/**
 * @file .ai/tools/worker-assignment/src/matchesAssignmentReaderPaths.validator.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Проверяет обязательный параметр path reader по точному списку путей привязки.
 */
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

const parameters = z.object({
  type: z.literal("object"),
  required: z.array(z.string()),
  properties: z.object({
    path: z.object({ type: z.literal("string"), enum: z.array(z.string()) }),
  }),
});

/** Порядок значений enum свободный, пропуски, повторы и подмены путей запрещены. */
export function matchesAssignmentReaderPaths(
  schema: unknown,
  paths: readonly string[],
) {
  const result = parameters.safeParse(schema);
  return (
    result.success &&
    result.data.required.includes("path") &&
    paths.length > 0 &&
    new Set(paths).size === paths.length &&
    isDeepStrictEqual(
      result.data.properties.path.enum.toSorted(),
      paths.toSorted(),
    )
  );
}
