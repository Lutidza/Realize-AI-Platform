/**
 * @file packages/payload-extension-manager/src/appearance/validateExtensionOperation.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет server principal, UUID и время чистой операции appearance.
 */
import {
  extensionActorKeySchema,
  extensionRequestIdSchema,
} from "./extensionAppearance.schemas";
import { ExtensionManagerError } from "./ExtensionManager.error";
import type { ExtensionOperationContext } from "./ExtensionAppearance.types";

/** Actor и время передаются server owner; client body их не содержит. */
export function validateExtensionOperation(
  input: ExtensionOperationContext,
): void {
  if (
    !extensionActorKeySchema.safeParse(input.actorKey).success ||
    !Number.isSafeInteger(input.nowMs) ||
    input.nowMs < 0 ||
    input.nowMs > 8640000000000000 - 30 * 60 * 1000 ||
    (input.requestId !== undefined &&
      !extensionRequestIdSchema.safeParse(input.requestId).success) ||
    (input.planId !== undefined &&
      !extensionRequestIdSchema.safeParse(input.planId).success)
  )
    throw new ExtensionManagerError("INVALID_INPUT");
}
