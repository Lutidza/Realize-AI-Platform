/**
 * @file packages/payload-extension-manager/src/admin-shell/mapAdminShellReceipt.mapper.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Ограничивает shell apply receipt публичным mode/revision/time DTO.
 * @see documentation/specifications/extension-management.md
 */
import type {
  AdminShellApplyReceipt,
  AdminShellReceiptDto,
} from "./AdminShell.types";

export function mapAdminShellReceipt(
  receipt: AdminShellApplyReceipt,
): AdminShellReceiptDto {
  return {
    planId: receipt.planId,
    mode: receipt.mode,
    appliedRevision: receipt.appliedRevision,
    appliedAt: receipt.appliedAt,
  };
}
