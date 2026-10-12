/**
 * @file packages/payload-extension-manager/src/appearance/extensionAppearance.constants.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Задаёт bounded retention и TTL appearance lifecycle.
 */
export const EXTENSION_APPEARANCE_LIMITS = {
  plans: 50,
  receipts: 256,
  defaultPlanTtlMs: 15 * 60 * 1000,
  maximumPlanTtlMs: 30 * 60 * 1000,
} as const;
