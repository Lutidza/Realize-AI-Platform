/**
 * @file packages/payload-extension-manager/src/appearance/hashExtensionValue.server.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Вычисляет SHA-256 canonical JSON только в серверной границе менеджера.
 * @see documentation/specifications/extension-management.md
 */
import { createHash } from "node:crypto";
import { ExtensionManagerError } from "./ExtensionManager.error";

/** Независимый от AI helper запрещает getters/prototypes/циклы и ограничивает работу. */
export function hashExtensionValue(input: unknown): string {
  const ancestors = new Set<object>();
  let visited = 0;
  const encode = (value: unknown, depth: number): string => {
    visited += 1;
    if (depth > 48 || visited > 100000)
      throw new ExtensionManagerError("INVALID_INPUT");
    if (value === null) return "null";
    if (
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    )
      return JSON.stringify(value);
    if (typeof value !== "object" || ancestors.has(value))
      throw new ExtensionManagerError("INVALID_INPUT");
    const prototype = Object.getPrototypeOf(value);
    const array = Array.isArray(value);
    if (
      Object.getOwnPropertySymbols(value).length ||
      (array
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null)
    )
      throw new ExtensionManagerError("INVALID_INPUT");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    ancestors.add(value);
    try {
      if (array) {
        if (
          Object.keys(descriptors).some(
            (key) => key !== "length" && !/^(0|[1-9]\d*)$/.test(key),
          )
        )
          throw new ExtensionManagerError("INVALID_INPUT");
        const parts: string[] = [];
        for (let index = 0; index < value.length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
            throw new ExtensionManagerError("INVALID_INPUT");
          parts.push(encode(descriptor.value, depth + 1));
        }
        return `[${parts.join(",")}]`;
      }
      return `{${Object.keys(descriptors)
        .sort()
        .map((key) => {
          const descriptor = descriptors[key];
          if (
            !descriptor?.enumerable ||
            !("value" in descriptor) ||
            ["__proto__", "prototype", "constructor"].includes(key)
          )
            throw new ExtensionManagerError("INVALID_INPUT");
          return `${JSON.stringify(key)}:${encode(descriptor.value, depth + 1)}`;
        })
        .join(",")}}`;
    } finally {
      ancestors.delete(value);
    }
  };
  const serialized = encode(input, 0);
  if (Buffer.byteLength(serialized, "utf8") > 2 * 1024 * 1024)
    throw new ExtensionManagerError("INVALID_INPUT");
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}
