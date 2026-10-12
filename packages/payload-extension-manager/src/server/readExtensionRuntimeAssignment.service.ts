/**
 * @file packages/payload-extension-manager/src/server/readExtensionRuntimeAssignment.service.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Читает effective назначение для проверенного server host с явно отмеченным fallback.
 * @see documentation/architecture/system-admin-shell.md
 */
import type { Payload } from "payload";
import type { TemplateTarget } from "@realize/template-contracts";
import type { ExtensionManagerOptions } from "../ExtensionManagerOptions.types";
import { resolveExtensionManagerOptions } from "../extensionManagerOptions.config";
import { ExtensionAppearanceRepository } from "../persistence/ExtensionAppearance.repository";
import { createExtensionRuntimeState } from "./createExtensionRuntimeState.service";
import { resolveStoredExtensionAssignment } from "./resolveStoredExtensionAssignment.service";
import type { ExtensionRuntimeAssignment } from "./ExtensionRuntimeAssignment.types";

/** Internal server reader не выдаёт доступ: вызывающий route уже проверяет session/ACL. */
export async function readExtensionRuntimeAssignment(
  payload: Payload,
  pluginOptions: ExtensionManagerOptions,
  target: TemplateTarget,
): Promise<ExtensionRuntimeAssignment> {
  const options = resolveExtensionManagerOptions(pluginOptions);
  const { catalog, bootstrapStore } =
    await createExtensionRuntimeState(options);
  const stored = await new ExtensionAppearanceRepository(payload).read(
    options.scopeKey,
  );
  const state = (stored.store ?? bootstrapStore).targets[target];
  const fallback = bootstrapStore.targets[target].current;
  const { assignment, requiresRecovery } = resolveStoredExtensionAssignment({
    catalog,
    target,
    current: state.current,
    fallback,
  });
  return {
    assignment,
    revision: state.revision,
    persisted: stored.store !== null,
    storageReady: stored.storageReady,
    requiresRecovery,
  };
}
