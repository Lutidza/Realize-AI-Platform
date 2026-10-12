/**
 * @file packages/payload-extension-manager/src/admin-shell/parseAdminShellStore.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Отказывает повреждённому shell state и tampered immutable plan/prepare receipts.
 * @see documentation/specifications/extension-management.md
 */
import { ExtensionManagerError } from "../appearance/ExtensionManager.error";
import { hashExtensionValue } from "../appearance/hashExtensionValue.server";
import type { AdminShellStore } from "./AdminShell.types";
import { adminShellStoreSchema } from "./adminShell.schemas";

export function parseAdminShellStore(input: unknown): AdminShellStore {
  try {
    const parsed = adminShellStoreSchema.safeParse(input);
    if (!parsed.success) throw new ExtensionManagerError("INVALID_STORE");
    for (const plan of [
      ...parsed.data.plans,
      ...parsed.data.receipts.flatMap((receipt) =>
        receipt.kind === "prepare" ? [receipt.plan] : [],
      ),
    ]) {
      const { hash, ...content } = plan;
      if (hashExtensionValue(content) !== hash)
        throw new ExtensionManagerError("INVALID_STORE");
    }
    return structuredClone(parsed.data);
  } catch {
    throw new ExtensionManagerError("INVALID_STORE");
  }
}
