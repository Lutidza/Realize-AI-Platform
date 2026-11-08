/**
 * @file packages/engineering-runtime/src/content/engineeringContent.index.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Экспортирует immutable content owner и публичные типы host port.
 * @see documentation/architecture/engineering-operations.md
 */
export { ImmutableContentRepository } from "./ImmutableContent.repository.ts";
export type {
  ContentIdentity,
  ContentReadResult,
  EngineeringContentPort,
  PreparedContentView,
} from "./EngineeringContent.types.ts";
