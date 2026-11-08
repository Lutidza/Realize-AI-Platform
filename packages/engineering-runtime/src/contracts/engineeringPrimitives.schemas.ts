/**
 * @file packages/engineering-runtime/src/contracts/engineeringPrimitives.schemas.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Проверяет идентификаторы, timestamps, hashes и лексические границы путей протокола.
 * @see documentation/architecture/engineering-operations.md
 */
import { z } from "zod";
import { ENGINEERING_BOUNDS } from "./engineeringBounds.constants.ts";

const encoder = new TextEncoder();

export const engineeringUuidSchema = z.uuid();
export const engineeringSha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const engineeringTimestampSchema = z.iso.datetime({
  offset: false,
  local: false,
});
export const engineeringRevisionSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

/** Лексический guard не заменяет descriptor-relative boundary реального FS adapter. */
export const engineeringPathSchema = z
  .string()
  .min(1)
  .max(ENGINEERING_BOUNDS.pathBytes)
  .refine((path) => {
    if (
      path.startsWith("/") ||
      /^[a-zA-Z]:/.test(path) ||
      path.includes("\\") ||
      path.includes("\0") ||
      encoder.encode(path).byteLength > ENGINEERING_BOUNDS.pathBytes
    )
      return false;
    const segments = path.split("/");
    return (
      segments.length <= ENGINEERING_BOUNDS.pathDepth &&
      segments.every(
        (segment) =>
          segment !== "" &&
          segment !== "." &&
          segment !== ".." &&
          encoder.encode(segment).byteLength <=
            ENGINEERING_BOUNDS.pathSegmentBytes,
      )
    );
  }, "Expected a bounded relative POSIX path without traversal");

/** Строки сохраняют регистр и Unicode; предел измеряется в UTF-8 bytes. */
export function engineeringTextSchema(maxBytes: number) {
  return z
    .string()
    .min(1)
    .max(maxBytes)
    .refine(
      (value) =>
        !value.includes("\0") && encoder.encode(value).byteLength <= maxBytes,
      "Text exceeds the UTF-8 byte limit or contains NUL",
    );
}

export const engineeringCursorSchema = engineeringTextSchema(
  ENGINEERING_BOUNDS.cursorBytes,
).nullable();
export const engineeringPageLimitSchema = z
  .number()
  .int()
  .min(1)
  .max(ENGINEERING_BOUNDS.maxPageItems);
