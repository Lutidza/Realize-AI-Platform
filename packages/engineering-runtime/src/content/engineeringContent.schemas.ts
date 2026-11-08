/**
 * @file packages/engineering-runtime/src/content/engineeringContent.schemas.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Проверяет strict metadata и private record immutable content без raw JSON доверия.
 * @see documentation/architecture/engineering-operations.md
 */
import { z } from "zod";
import { ENGINEERING_BOUNDS } from "../contracts/engineeringBounds.constants.ts";
import {
  engineeringSha256Schema,
  engineeringTimestampSchema,
  engineeringUuidSchema,
} from "../contracts/engineeringPrimitives.schemas.ts";
import { CONTENT_ENCODED_MAX_BYTES } from "./engineeringContent.constants.ts";

export const contentIdentitySchema = z.strictObject({
  key: engineeringSha256Schema,
  hash: engineeringSha256Schema,
  principalHash: engineeringSha256Schema,
});
export const preparedContentViewSchema = z.strictObject({
  schemaVersion: z.literal(1),
  contentRef: engineeringUuidSchema,
  byteLength: z
    .number()
    .int()
    .nonnegative()
    .max(ENGINEERING_BOUNDS.contentBytes),
  sha256: engineeringSha256Schema,
  mediaType: z.enum([
    "text/plain",
    "application/json",
    "application/octet-stream",
  ]),
  expiresAt: engineeringTimestampSchema,
});
export const immutableContentRecordSchema = z.strictObject({
  version: z.literal(1),
  targetId: engineeringUuidSchema,
  identity: contentIdentitySchema,
  view: preparedContentViewSchema,
  bytes: z.string().max(CONTENT_ENCODED_MAX_BYTES),
});
