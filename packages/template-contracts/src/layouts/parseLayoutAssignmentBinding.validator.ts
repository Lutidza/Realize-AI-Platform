/**
 * @file packages/template-contracts/src/layouts/parseLayoutAssignmentBinding.validator.ts
 * @version 1.0.0
 * @date 2026-11-18
 * @description Читает bounded JSON фиксации макета и возвращает отделённый неизменяемый snapshot.
 * @see documentation/specifications/extension-management.md
 */
import { layoutAssignmentBindingSchema } from "./layoutAssignmentBinding.schemas";
import { parseLayoutValue } from "./parseLayoutValue.validator";
import { freezeLayoutValue } from "./freezeLayoutValue.util";
import type { LayoutAssignmentBinding } from "./LayoutDescriptor.types";

/** Parser не разрешает alias, не сверяет hash с каталогом и не предоставляет права исполнения. */
export function parseLayoutAssignmentBinding(
  value: unknown,
): LayoutAssignmentBinding {
  return freezeLayoutValue(
    parseLayoutValue(
      layoutAssignmentBindingSchema,
      value,
      "INVALID_LAYOUT_BINDING",
    ),
  );
}
