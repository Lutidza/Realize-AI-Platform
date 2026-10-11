/**
 * @file packages/ai-contracts/src/platform-release/PlatformRelease.types.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Экспортирует типы контрактов выпуска, Git и установленного состояния.
 * @see documentation/delivery/02-ci-release-deploy.md
 */

import type { z } from "zod";
import type {
  gitDeliveryBindingSchema,
  gitDeliveryRequestSchema,
} from "./gitDeliveryBinding.validator.ts";
import type {
  installedPlatformStateSchema,
  platformReleaseManifestSchema,
  platformReleasePayloadSchema,
} from "./platformRelease.validator.ts";
import type {
  platformComponentSchema,
  platformSourceInventorySchema,
} from "./platformSourceInventory.validator.ts";

export type GitDeliveryBinding = z.infer<typeof gitDeliveryBindingSchema>;
export type GitDeliveryRequest = z.infer<typeof gitDeliveryRequestSchema>;
export type PlatformComponent = z.infer<typeof platformComponentSchema>;
export type PlatformSourceInventory = z.infer<
  typeof platformSourceInventorySchema
>;
export type PlatformReleasePayload = z.infer<
  typeof platformReleasePayloadSchema
>;
export type PlatformReleaseManifest = z.infer<
  typeof platformReleaseManifestSchema
>;
export type InstalledPlatformState = z.infer<
  typeof installedPlatformStateSchema
>;

/** Сравнение версий не является signature verification, approval или разрешением на side effect. */
export type PlatformCompatibilityEvidence = {
  schemaVersion: 1;
  compatible: boolean;
  manifestHash: string;
  inventoryHash: string;
  installedStateHash: string;
  checkedAt: string;
  issues: { code: string; path: string; message: string }[];
};

export type ComparePlatformInstallationInput = {
  manifest: unknown;
  installed: unknown;
  expectedManifestHash: string;
  expectedPlatformRepositoryId: string;
  audience: "development" | "external";
  checkedAt: string;
};
