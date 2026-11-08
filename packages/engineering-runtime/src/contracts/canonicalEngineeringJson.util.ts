/**
 * @file packages/engineering-runtime/src/contracts/canonicalEngineeringJson.util.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Строит ограниченный versioned canonical JSON без нормализации строк и порядка массивов.
 * @see documentation/architecture/engineering-operations.md
 */
import type { CanonicalEngineeringJsonOptions } from "./CanonicalEngineeringJson.types.ts";
import { ENGINEERING_NORMALIZATION_VERSION } from "./engineeringBounds.constants.ts";

const encoder = new TextEncoder();

/**
 * Сортирует ключи plain objects и сохраняет exact строки/порядок массивов.
 * Отклоняет cycles, holes, accessors, hidden properties и не-JSON объекты.
 * Бюджет проверяется при каждом token, до накопления полного результата.
 */
export function canonicalEngineeringJson(
  value: unknown,
  options: CanonicalEngineeringJsonOptions = {},
): string {
  const limits = {
    maxBytes: options.maxBytes ?? 1024 * 1024,
    maxDepth: options.maxDepth ?? 64,
    maxNodes: options.maxNodes ?? 100_000,
    maxStringBytes: options.maxStringBytes ?? options.maxBytes ?? 1024 * 1024,
    maxArrayItems: options.maxArrayItems ?? 100_000,
    maxObjectKeys: options.maxObjectKeys ?? 100_000,
  };
  if (
    Object.values(limits).some(
      (limit) => !Number.isSafeInteger(limit) || limit < 1,
    ) ||
    limits.maxDepth > 256
  ) {
    throw new TypeError("Invalid canonical JSON limits");
  }
  let bytes = 0;
  let nodes = 0;
  const chunks: string[] = [];
  const parents = new Set<object>();

  function append(token: string): void {
    if (token.length > limits.maxBytes - bytes) {
      throw new RangeError("Canonical JSON byte limit exceeded");
    }
    bytes += encoder.encode(token).byteLength;
    if (bytes > limits.maxBytes) {
      throw new RangeError("Canonical JSON byte limit exceeded");
    }
    chunks.push(token);
  }

  function appendString(text: string): void {
    if (
      text.length > limits.maxStringBytes ||
      encoder.encode(text).byteLength > limits.maxStringBytes
    ) {
      throw new RangeError("Canonical JSON string limit exceeded");
    }
    append(JSON.stringify(text));
  }

  function visit(current: unknown, depth: number): void {
    nodes += 1;
    if (depth > limits.maxDepth || nodes > limits.maxNodes) {
      throw new RangeError("Canonical JSON traversal limit exceeded");
    }
    if (current === null) {
      append("null");
      return;
    }
    if (typeof current === "string") {
      appendString(current);
      return;
    }
    if (typeof current === "boolean") {
      append(current ? "true" : "false");
      return;
    }
    if (typeof current === "number" && Number.isFinite(current)) {
      append(JSON.stringify(current));
      return;
    }
    if (typeof current !== "object") {
      throw new TypeError("Unsupported canonical JSON value");
    }
    if (parents.has(current)) {
      throw new TypeError("Cyclic canonical JSON value");
    }
    const isArray = Array.isArray(current);
    const prototype = Object.getPrototypeOf(current);
    if (
      (isArray && prototype !== Array.prototype) ||
      (!isArray && prototype !== Object.prototype && prototype !== null)
    ) {
      throw new TypeError("Only plain JSON objects and arrays are supported");
    }
    const keys = Reflect.ownKeys(current);
    if (keys.some((key) => typeof key !== "string")) {
      throw new TypeError("Symbol keys are not JSON properties");
    }
    parents.add(current);
    if (isArray) {
      if (
        current.length > limits.maxArrayItems ||
        current.length > limits.maxNodes - nodes ||
        keys.length !== current.length + 1
      ) {
        throw new RangeError("Canonical JSON array limit or shape invalid");
      }
      append("[");
      for (let index = 0; index < current.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          current,
          String(index),
        );
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          throw new TypeError("Array holes and accessors are not JSON values");
        }
        if (index > 0) append(",");
        visit(descriptor.value, depth + 1);
      }
      append("]");
    } else {
      if (
        keys.length > limits.maxObjectKeys ||
        keys.length > limits.maxNodes - nodes
      ) {
        throw new RangeError("Canonical JSON object limit exceeded");
      }
      append("{");
      const sortedKeys = (keys as string[]).sort();
      for (let index = 0; index < sortedKeys.length; index += 1) {
        const key = sortedKeys[index];
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          throw new TypeError(
            "Hidden properties and accessors are not JSON values",
          );
        }
        if (index > 0) append(",");
        appendString(key);
        append(":");
        visit(descriptor.value, depth + 1);
      }
      append("}");
    }
    parents.delete(current);
  }

  append(
    `{"normalizationVersion":${ENGINEERING_NORMALIZATION_VERSION},"value":`,
  );
  visit(value, 0);
  append("}");
  return chunks.join("");
}
