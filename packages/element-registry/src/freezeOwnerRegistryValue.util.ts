/**
 * @file packages/element-registry/src/freezeOwnerRegistryValue.util.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Замораживает ограниченные plain значения подготовленного owner snapshot и результата lookup.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */

/** Получает только detached plain graph после schema validation, без циклов и сторонних объектов. */
export function freezeOwnerRegistryValue<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeOwnerRegistryValue(child);
    Object.freeze(value);
  }
  return value;
}
