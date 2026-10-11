/**
 * @file packages/change-engine/src/platform-release/platformRelease.server.index.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Публикует серверные проверки версий и происхождения платформы для delivery adapters.
 */

export { hashCanonicalJSON } from "../canonicalJson.ts";
export { createMigrationSetHash } from "../releasePolicy.ts";
export { assertGitDeliveryRequest } from "./assertGitDeliveryRequest.validator.ts";
export { verifyPlatformSourceInventory } from "./verifyPlatformSourceInventory.validator.ts";
export { createPlatformReleaseManifest } from "./createPlatformReleaseManifest.service.ts";
export { comparePlatformInstallation } from "./comparePlatformInstallation.service.ts";
