/**
 * @file packages/ai-contracts/src/platform-release/platformRelease.index.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Публикует browser-safe контракты версий платформы без серверных зависимостей.
 */

export {
  exactVersionSchema,
  releaseComponentKindSchema,
  releaseSourcePathSchema,
  releaseSupportSchema,
} from "./platformVersion.validator.ts";
export {
  gitDeliveryBindingSchema,
  gitDeliveryRequestSchema,
} from "./gitDeliveryBinding.validator.ts";
export { platformSourceInventorySchema } from "./platformSourceInventory.validator.ts";
export {
  platformReleasePayloadSchema,
  platformReleaseManifestSchema,
  installedPlatformStateSchema,
} from "./platformRelease.validator.ts";
export type {
  GitDeliveryBinding,
  GitDeliveryRequest,
  PlatformComponent,
  PlatformSourceInventory,
  PlatformReleasePayload,
  PlatformReleaseManifest,
  InstalledPlatformState,
  PlatformCompatibilityEvidence,
  ComparePlatformInstallationInput,
} from "./PlatformRelease.types.ts";
