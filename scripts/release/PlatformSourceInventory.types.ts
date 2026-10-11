/**
 * @file scripts/release/PlatformSourceInventory.types.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Задаёт входы filesystem inventory и границу legacy migration evidence.
 */

import type { PlatformSourceInventory } from "@realize/ai-contracts/platform-release";

export type ReleaseSourceFilesInput = { sourceRoot: string; paths: string[] };
export type PlatformSourceInventoryInput = {
  sourceRoot: string;
  migrations: PlatformSourceInventory["schema"]["migrations"];
  migrationSetHash: string;
};
