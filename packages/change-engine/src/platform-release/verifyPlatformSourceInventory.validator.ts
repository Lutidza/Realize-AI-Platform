/**
 * @file packages/change-engine/src/platform-release/verifyPlatformSourceInventory.validator.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Проверяет связность хешей source inventory и порядка миграций.
 * @see documentation/delivery/02-ci-release-deploy.md
 */

import {
  platformSourceInventorySchema,
  type PlatformSourceInventory,
} from "@realize/ai-contracts/platform-release";
import { hashCanonicalJSON } from "../canonicalJson.ts";
import { createMigrationSetHash } from "../releasePolicy.ts";

/** Проверяет hash-of-hashes; bytes исходников проверяет filesystem/registry adapter. */
export const verifyPlatformSourceInventory = (
  value: unknown,
): PlatformSourceInventory => {
  const inventory = platformSourceInventorySchema.parse(value);
  for (const component of inventory.components) {
    if (component.sha256 !== hashCanonicalJSON(component.files)) {
      throw new Error(`Component source hash mismatch: ${component.id}`);
    }
  }
  if (
    inventory.schema.migrationSetHash !==
      createMigrationSetHash(inventory.schema.migrations) ||
    inventory.schema.migrationOrderHash !==
      hashCanonicalJSON(inventory.schema.migrations)
  ) {
    throw new Error("Migration inventory hash/order mismatch");
  }
  return inventory;
};
