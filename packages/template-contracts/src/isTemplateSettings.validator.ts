/**
 * @file packages/template-contracts/src/isTemplateSettings.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет ограниченный JSON-снимок настроек до рекурсивного schema parse.
 */

import type { TemplateSettings } from "./TemplateValue.types";

/** Ограничения SDK предотвращают циклы/неограниченную глубину, не задают storage quota. */
export function isTemplateSettings(input: unknown): input is TemplateSettings {
  if (input === null || typeof input !== "object" || Array.isArray(input))
    return false;
  const pending: { value: unknown; ancestors: readonly object[] }[] = [
    { value: input, ancestors: [] },
  ];
  let visited = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) return false;
    visited += 1;
    if (visited > 4096 || current.ancestors.length > 32) return false;
    const { value, ancestors } = current;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      continue;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return false;
      continue;
    }
    if (typeof value !== "object" || ancestors.includes(value)) return false;
    if (!Array.isArray(value)) {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) return false;
      if (
        Object.keys(value).some((key) =>
          ["__proto__", "prototype", "constructor"].includes(key),
        )
      )
        return false;
    }
    if (Object.getOwnPropertySymbols(value).length > 0) return false;
    const nextAncestors = [...ancestors, value];
    if (Array.isArray(value)) {
      if (
        value.length > 4096 ||
        Object.getPrototypeOf(value) !== Array.prototype
      )
        return false;
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (
        Object.keys(descriptors).some(
          (key) => key !== "length" && !/^(0|[1-9]\d*)$/.test(key),
        )
      )
        return false;
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, "value")) return false;
        pending.push({ value: descriptor.value, ancestors: nextAncestors });
      }
    } else {
      const descriptors = Object.values(
        Object.getOwnPropertyDescriptors(value),
      );
      if (descriptors.length > 4096) return false;
      for (const descriptor of descriptors) {
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value"))
          return false;
        pending.push({ value: descriptor.value, ancestors: nextAncestors });
      }
    }
    if (pending.length + visited > 4096) return false;
  }
  return true;
}
