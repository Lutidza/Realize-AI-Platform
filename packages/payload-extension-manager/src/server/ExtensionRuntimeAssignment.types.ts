/**
 * @file packages/payload-extension-manager/src/server/ExtensionRuntimeAssignment.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Описывает effective назначение server host и признаки source fallback.
 * @see documentation/architecture/system-admin-shell.md
 */
import type { ExtensionAssignment } from "../appearance/ExtensionAppearance.types";

/** Fallback не переписывает сохранённый указатель при несовместимости сборки. */
export type ExtensionRuntimeAssignment = {
  assignment: ExtensionAssignment | null;
  revision: number;
  persisted: boolean;
  storageReady: boolean;
  requiresRecovery: boolean;
};
