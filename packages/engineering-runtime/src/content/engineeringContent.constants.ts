/**
 * @file packages/engineering-runtime/src/content/engineeringContent.constants.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Задаёт отдельные byte budgets immutable content и срок первоначальной подготовки.
 * @see documentation/architecture/engineering-operations.md
 */
import { ENGINEERING_BOUNDS } from "../contracts/engineeringBounds.constants.ts";

export const CONTENT_ENCODED_MAX_BYTES =
  4 * Math.ceil(ENGINEERING_BOUNDS.contentBytes / 3);
export const CONTENT_RECORD_MAX_BYTES = CONTENT_ENCODED_MAX_BYTES + 4096;
export const CONTENT_COMMAND_MAX_BYTES =
  CONTENT_ENCODED_MAX_BYTES + ENGINEERING_BOUNDS.commandBytes;
export const CONTENT_TTL_MS = 30 * 60_000;
