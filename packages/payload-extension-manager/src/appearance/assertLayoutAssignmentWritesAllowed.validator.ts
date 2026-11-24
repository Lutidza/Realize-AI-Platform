/**
 * @file packages/payload-extension-manager/src/appearance/assertLayoutAssignmentWritesAllowed.validator.ts
 * @version 1.0.0
 * @date 2026-11-18
 * @description Запрещает новые durable snapshots с exact layout bindings до доверенного включения записи.
 * @see documentation/specifications/extension-management.md
 */
import type { AdminShellStore } from "../admin-shell/AdminShell.types";
import type {
  ExtensionAppearanceStore,
  ExtensionAssignment,
  ExtensionLayoutAssignmentWritePolicy,
} from "./ExtensionAppearance.types";
import { ExtensionManagerError } from "./ExtensionManager.error";

/** Проверяет только типизированное поле назначения, а не произвольные данные settings. */
function hasLayoutBinding(
  assignment: ExtensionAssignment | null | undefined,
): boolean {
  return assignment?.layout !== undefined;
}

/** Вызывается только перед новой записью после replay; чтение и immutable receipts не изменяет. */
export function assertLayoutAssignmentWritesAllowed(
  store: ExtensionAppearanceStore | AdminShellStore,
  policy: ExtensionLayoutAssignmentWritePolicy = "disabled",
): void {
  if (policy === "enabled") return;

  const assignments: (ExtensionAssignment | null | undefined)[] =
    "targets" in store
      ? [
          store.targets.admin.current,
          store.targets.admin.previous,
          store.targets.frontend.current,
          store.targets.frontend.previous,
          ...store.plans.map((plan) => plan.desiredAssignment),
          ...store.receipts.flatMap((receipt) =>
            receipt.kind === "prepare"
              ? [receipt.plan.desiredAssignment, receipt.current]
              : [receipt.assignment],
          ),
        ]
      : [
          ...store.plans.map((plan) => plan.templateBinding?.assignment),
          ...store.receipts.flatMap((receipt) =>
            receipt.kind === "prepare"
              ? [receipt.plan.templateBinding?.assignment]
              : [],
          ),
        ];

  if (assignments.some(hasLayoutBinding))
    throw new ExtensionManagerError("LAYOUT_BINDING_WRITES_DISABLED");
}
