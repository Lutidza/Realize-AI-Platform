/**
 * @file packages/change-engine/src/canonicalJson.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Канонизирует JSON и вычисляет стабильные SHA-256 для policy artifacts.
 * @docref Realize — AI Platform v1.0 — Интеграция системного и installation AI-layer
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/10-ai-codex-layer-integration.md
 */

import { createHash } from "node:crypto";

/** Ошибка при попытке хешировать значение вне строгого JSON contract. */
export class CanonicalJSONError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalJSONError";
  }
}

const canonicalize = (
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
  depth: number,
): string => {
  if (depth > 100) {
    throw new CanonicalJSONError(`${path} exceeds the maximum JSON depth.`);
  }
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new CanonicalJSONError(`${path} contains a non-finite number.`);
      }
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "bigint":
    case "function":
    case "symbol":
    case "undefined":
      throw new CanonicalJSONError(`${path} is not JSON-compatible.`);
    case "object":
      break;
  }

  const object = value as object;
  if (ancestors.has(object)) {
    throw new CanonicalJSONError(`${path} contains a circular reference.`);
  }
  ancestors.add(object);

  try {
    if (Array.isArray(value)) {
      if (Object.getOwnPropertySymbols(value).length > 0) {
        throw new CanonicalJSONError(`${path} contains symbol properties.`);
      }
      const ownNames = Object.getOwnPropertyNames(value);
      const expectedNames = new Set([
        "length",
        ...Array.from({ length: value.length }, (_, index) => String(index)),
      ]);
      if (ownNames.some((name) => !expectedNames.has(name))) {
        throw new CanonicalJSONError(
          `${path} contains non-JSON array properties.`,
        );
      }
      const items = Array.from({ length: value.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          throw new CanonicalJSONError(
            `${path}[${index}] must be an enumerable data property.`,
          );
        }
        return canonicalize(
          descriptor.value,
          `${path}[${index}]`,
          ancestors,
          depth + 1,
        );
      });
      return `[${items.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalJSONError(`${path} must contain a plain object.`);
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new CanonicalJSONError(`${path} contains symbol properties.`);
    }
    const entries = Object.getOwnPropertyNames(value)
      .sort()
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          throw new CanonicalJSONError(
            `${path}.${key} must be an enumerable data property.`,
          );
        }
        return `${JSON.stringify(key)}:${canonicalize(
          descriptor.value,
          `${path}.${key}`,
          ancestors,
          depth + 1,
        )}`;
      });
    return `{${entries.join(",")}}`;
  } finally {
    ancestors.delete(object);
  }
};

/** Сериализует одно strict JSON value с рекурсивной сортировкой object keys. */
export const canonicalizeJSON = (value: unknown): string =>
  canonicalize(value, "$", new WeakSet<object>(), 0);

/** Возвращает lowercase SHA-256 exact canonical JSON representation. */
export const hashCanonicalJSON = (value: unknown): string =>
  createHash("sha256").update(canonicalizeJSON(value)).digest("hex");
