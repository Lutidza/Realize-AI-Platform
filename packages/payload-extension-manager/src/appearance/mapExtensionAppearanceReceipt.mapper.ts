/**
 * @file packages/payload-extension-manager/src/appearance/mapExtensionAppearanceReceipt.mapper.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Возвращает allowlist результата apply без ledger identity/fingerprint.
 * @see documentation/specifications/extension-management.md
 */
import type {
  ExtensionApplyReceipt,
  ExtensionAppearanceReceiptDto,
} from "./ExtensionAppearance.types";

/** Receipt DTO показывает применённую revision, а не текущее mutable назначение target. */
export function mapExtensionAppearanceReceipt(
  receipt: ExtensionApplyReceipt,
): ExtensionAppearanceReceiptDto {
  return {
    planId: receipt.planId,
    target: receipt.target,
    appliedRevision: receipt.appliedRevision,
    assignment: structuredClone(receipt.assignment),
    appliedAt: receipt.appliedAt,
  };
}
