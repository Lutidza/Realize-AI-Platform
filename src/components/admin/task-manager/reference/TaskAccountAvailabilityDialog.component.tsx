/**
 * @file src/components/admin/task-manager/reference/TaskAccountAvailabilityDialog.component.tsx
 * @version 1.0.0
 * @date 2026-09-19
 * @description Объясняет недоступность баланса без вымышленных сумм и имитации платежа.
 * @see documentation/architecture/system-admin-shell.md
 */
import { Wallet, CreditCard } from "lucide-react";
import { UiButton, UiDialog } from "@realize/ui-kit";
import type { TaskAccountAvailabilityDialogProps } from "./TaskWorkbenchToolbar.types";
import { taskWorkbenchMessages } from "./taskWorkbench.messages";

export function TaskAccountAvailabilityDialog({
  view,
  theme,
  locale,
  onClose,
}: TaskAccountAvailabilityDialogProps) {
  const t = taskWorkbenchMessages[locale].account;
  return (
    <UiDialog
      open={Boolean(view)}
      mode={theme}
      size="compact"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={view === "topup" ? t.topup : t.balance}
      icon={view === "topup" ? <CreditCard size={24} /> : <Wallet size={24} />}
      description={view === "topup" ? t.topupUnavailable : t.balanceUnavailable}
      footer={
        <UiButton variant="secondary" onClick={onClose}>
          {t.close}
        </UiButton>
      }
    />
  );
}
