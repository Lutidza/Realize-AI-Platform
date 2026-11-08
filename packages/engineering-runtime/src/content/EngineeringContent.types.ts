/**
 * @file packages/engineering-runtime/src/content/EngineeringContent.types.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Определяет ограниченный content port и безопасную ссылку на immutable bytes.
 * @see documentation/architecture/engineering-operations.md
 */
import type { z } from "zod";
import type { PrepareContentCommand } from "../contracts/EngineeringCommand.types.ts";
import type { immutableContentRecordSchema } from "./engineeringContent.schemas.ts";

/** Публичная ссылка содержит только проверенные metadata; bytes и principal остаются приватными. */
export interface PreparedContentView {
  schemaVersion: 1;
  contentRef: string;
  byteLength: number;
  sha256: string;
  mediaType: PrepareContentCommand["mediaType"];
  expiresAt: string;
}
export interface ContentIdentity {
  key: string;
  hash: string;
  principalHash: string;
}
/** Port хранит idempotency identity и точные bytes одной атомарной immutable записью. */
export interface EngineeringContentPort {
  prepare(
    command: PrepareContentCommand,
    identity: ContentIdentity,
  ): PreparedContentView;
}
export type ImmutableContentRecord = z.infer<
  typeof immutableContentRecordSchema
>;
/** Приватное чтение для подготовки frozen staging, не remote API response. */
export type ContentReadResult = {
  bytes: Uint8Array;
  view: PreparedContentView;
};
