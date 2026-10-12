/**
 * @file src/components/admin/extensions/AdminShellPicker.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Описывает клиентский transport и команды выбора встроенной оболочки Admin.
 */
import type {
  AdminShellSnapshotDto,
  AdminShellPrepareResponseDto,
  AdminShellApplyResponseDto,
  PrepareAdminShellInput,
  ApplyAdminShellInput,
  AdminShellPlanDto,
  AdminShellReceiptDto,
  AdminShellMode,
} from "@realize/payload-extension-manager/contracts";
import type { useAdminShellManager } from "./useAdminShellManager.hook";

export type AdminShellTransport = {
  snapshot: (signal?: AbortSignal) => Promise<AdminShellSnapshotDto>;
  prepare: (
    input: PrepareAdminShellInput,
    requestId: string,
  ) => Promise<AdminShellPrepareResponseDto>;
  apply: (
    input: ApplyAdminShellInput,
    requestId: string,
  ) => Promise<AdminShellApplyResponseDto>;
};
export type AdminShellCommandInput =
  | { kind: "prepare"; input: PrepareAdminShellInput }
  | { kind: "apply"; input: ApplyAdminShellInput };
export type AdminShellCommandResult =
  | { kind: "prepare"; data: AdminShellPrepareResponseDto }
  | { kind: "apply"; data: AdminShellApplyResponseDto };
export type AdminShellPickerProps = {
  manager: ReturnType<typeof useAdminShellManager>;
};
export type AdminShellPlanProps = {
  plan: AdminShellPlanDto;
  disabled: boolean;
  invalidReason: string | null;
  onApply: () => void;
  onDiscard: () => void;
};
export type AdminShellHistoryProps = {
  history: AdminShellReceiptDto[];
  previous: AdminShellMode | null;
  disabled: boolean;
  onRecover: () => void;
};
