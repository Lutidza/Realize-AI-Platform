/**
 * @file packages/payload-extension-manager/src/server/readAdminShellRuntime.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Читает effective оболочку и явный fallback, сохраняя первоначальный pointer.
 * @see documentation/specifications/extension-management.md
 */
import type { Payload } from "payload";
import type { ExtensionManagerOptions } from "../ExtensionManagerOptions.types";
import { resolveExtensionManagerOptions } from "../extensionManagerOptions.config";
import { createAdminShellStore } from "../admin-shell/createAdminShellStore.util";
import { readAdminShellState } from "../admin-shell/readAdminShellState.service";
import { hashAdminShellPolicy } from "../admin-shell/hashAdminShellPolicy.server";
import { ExtensionAppearanceRepository } from "../persistence/ExtensionAppearance.repository";
import { ExtensionAppearanceStorageError } from "../persistence/ExtensionAppearanceStorage.error";
import { ExtensionManagerError } from "../appearance/ExtensionManager.error";
import {
  createAdminShellRepository,
  adminShellScope,
} from "./createAdminShellRepository.service";
import { resolveAdminShellPolicy } from "./resolveAdminShellPolicy.service";
import { createExtensionRuntimeState } from "./createExtensionRuntimeState.service";

/** Caller владеет session/ACL; reader не делает writes и не запускает migrations. */
export async function readAdminShellRuntime(
  payload: Payload,
  input: ExtensionManagerOptions,
) {
  const options = resolveExtensionManagerOptions(input);
  const policy = await resolveAdminShellPolicy(options);
  const stored = await createAdminShellRepository(payload).read(
    adminShellScope(options.scopeKey),
  );
  const store = stored.store ?? createAdminShellStore(policy);
  let appearance = null;
  if (
    policy.enabled.template &&
    (store.state.current !== "native" || !policy.enabled.native)
  ) {
    try {
      const runtime = await createExtensionRuntimeState(options);
      const state = await new ExtensionAppearanceRepository(payload).read(
        options.scopeKey,
      );
      appearance = {
        store: state.store ?? runtime.bootstrapStore,
        catalog: runtime.catalog,
      };
    } catch (error) {
      // Проверенный native fallback доступен при повреждении custom domain; shell corruption и SQL outage не скрываются.
      const invalidCustom =
        (error instanceof ExtensionAppearanceStorageError &&
          error.code === "INVALID_STORAGE_STATE") ||
        (error instanceof ExtensionManagerError &&
          [
            "INVALID_CATALOG",
            "INVALID_SETTINGS",
            "ASSIGNMENT_UNAVAILABLE",
          ].includes(error.code));
      if (!policy.enabled.native || !invalidCustom) throw error;
    }
  }
  return {
    ...readAdminShellState({ store, policy, appearance }),
    policy,
    policyHash: hashAdminShellPolicy(policy),
    persisted: Boolean(stored.store),
    storageReady: stored.storageReady,
  };
}
