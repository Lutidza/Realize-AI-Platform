/**
 * @file packages/payload-extension-manager/src/admin-shell/createAdminShellStore.util.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Создаёт отдельный host shell state без записи template selection или settings.
 * @see documentation/specifications/extension-management.md
 */
import type { AdminShellPolicy, AdminShellStore } from "./AdminShell.types";
import { parseAdminShellPolicy } from "./parseAdminShellPolicy.validator";
import { parseAdminShellStore } from "./parseAdminShellStore.validator";

export function createAdminShellStore(
  input: AdminShellPolicy,
): AdminShellStore {
  const policy = parseAdminShellPolicy(input);
  return parseAdminShellStore({
    schemaVersion: "1.0",
    domain: "admin-shell",
    state: { revision: 0, current: policy.defaultMode, previous: null },
    plans: [],
    receipts: [],
  });
}
