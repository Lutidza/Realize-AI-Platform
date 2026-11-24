/**
 * @file packages/template-contracts/src/layouts/parseLayoutDescriptor.validator.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Возвращает проверенное неизменяемое описание Admin-макета без compiled renderer.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { layoutDescriptorSchema } from "./layoutDescriptor.schemas";
import { parseLayoutValue } from "./parseLayoutValue.validator";
import { freezeLayoutValue } from "./freezeLayoutValue.util";
import type { LayoutDescriptor } from "./LayoutDescriptor.types";

/** Valid descriptor не подтверждает публикацию, совместимость executable, установку или actor ACL. */
export function parseLayoutDescriptor(value: unknown): LayoutDescriptor {
  return freezeLayoutValue(
    parseLayoutValue(layoutDescriptorSchema, value, "INVALID_DESCRIPTOR"),
  );
}
