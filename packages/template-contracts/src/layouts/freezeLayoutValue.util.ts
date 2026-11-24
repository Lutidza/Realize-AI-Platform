/**
 * @file packages/template-contracts/src/layouts/freezeLayoutValue.util.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Замораживает ограниченные detached plain graphs layout metadata после validation.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */

/** Получает plain schema output без циклов, callbacks или runtime instances. */
export function freezeLayoutValue<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeLayoutValue(child);
    Object.freeze(value);
  }
  return value;
}
