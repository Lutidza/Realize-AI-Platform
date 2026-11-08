/**
 * @file packages/engineering-runtime/src/content/mapPreparedContent.mapper.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Выдаёт только проверенную публичную проекцию immutable content metadata.
 * @see documentation/architecture/engineering-operations.md
 */
import { canonicalEngineeringJson } from "../contracts/canonicalEngineeringJson.util.ts";
import { failure } from "../runtime/EngineeringFailure.error.ts";
import { preparedContentViewSchema } from "./engineeringContent.schemas.ts";
import type { PreparedContentView } from "./EngineeringContent.types.ts";

/** Strict projection применяется и к trusted port response, чтобы private fields не пересекали facade. */
export function mapPreparedContent(value: unknown): PreparedContentView {
  try {
    canonicalEngineeringJson(value, {
      maxBytes: 4096,
      maxDepth: 4,
      maxNodes: 16,
    });
  } catch {
    return failure(
      "INTERNAL_ERROR",
      "Content port вернул недопустимую metadata.",
    );
  }
  const parsed = preparedContentViewSchema.safeParse(value);
  if (!parsed.success)
    return failure(
      "INTERNAL_ERROR",
      "Content port вернул недопустимую metadata.",
    );
  return {
    schemaVersion: 1,
    contentRef: parsed.data.contentRef,
    byteLength: parsed.data.byteLength,
    sha256: parsed.data.sha256,
    mediaType: parsed.data.mediaType,
    expiresAt: parsed.data.expiresAt,
  };
}
