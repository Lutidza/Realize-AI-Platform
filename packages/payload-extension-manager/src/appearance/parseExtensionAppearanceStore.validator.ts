/**
 * @file packages/payload-extension-manager/src/appearance/parseExtensionAppearanceStore.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Отклоняет повреждённый storage snapshot и изменённые immutable планы.
 */
import type { ExtensionAppearanceStore } from "./ExtensionAppearance.types";
import { ExtensionManagerError } from "./ExtensionManager.error";
import { extensionAppearanceStoreSchema } from "./extensionAppearance.schemas";
import { hashExtensionValue } from "./hashExtensionValue.server";

/** Hash проверяется у pending plans и ledger snapshots; ошибка storage не раскрывает JSON. */
export function parseExtensionAppearanceStore(
  input: unknown,
): ExtensionAppearanceStore {
  try {
    const parsed = extensionAppearanceStoreSchema.safeParse(input);
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
