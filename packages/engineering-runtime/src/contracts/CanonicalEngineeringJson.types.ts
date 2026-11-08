/**
 * @file packages/engineering-runtime/src/contracts/CanonicalEngineeringJson.types.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Описывает JSON-значения и бюджеты канонизации инженерных контрактов.
 * @see documentation/architecture/engineering-operations.md
 */

/** Только переносимые JSON-значения; undefined и специальные объекты запрещены. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Доверенные ограничения сериализации; maxBytes включает versioned envelope. */
export interface CanonicalEngineeringJsonOptions {
  maxBytes?: number;
  maxDepth?: number;
  maxNodes?: number;
  maxStringBytes?: number;
  maxArrayItems?: number;
  maxObjectKeys?: number;
}
