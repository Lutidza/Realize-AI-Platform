/**
 * @file packages/template-contracts/src/layouts/assertLayoutSlots.validator.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Запрещает передачу наполнения в отсутствующие runtime ports выбранного макета.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { parseLayoutDescriptor } from "./parseLayoutDescriptor.validator";
import { LayoutContractError } from "./LayoutContract.error";

/** Пустое наполнение разрешено для всех ports; проверка не подтверждает совместимость компонентов редактора. */
export function assertLayoutSlots(
  value: unknown,
  providedSlotKeys: readonly string[],
): void {
  const descriptor = parseLayoutDescriptor(value);
  if (
    !Array.isArray(providedSlotKeys) ||
    providedSlotKeys.length > 6 ||
    providedSlotKeys.some((key) => typeof key !== "string") ||
    new Set(providedSlotKeys).size !== providedSlotKeys.length
  )
    throw new LayoutContractError("INVALID_SLOT_KEYS", "/providedSlotKeys");
  const supported = new Set<string>(
    descriptor.regions.flatMap((region) => region.slots),
  );
  for (const [index, key] of providedSlotKeys.entries()) {
    if (!supported.has(key))
      throw new LayoutContractError(
        "UNSUPPORTED_SLOT",
        `/providedSlotKeys/${index}`,
      );
  }
}
