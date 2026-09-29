/**
 * @file packages/ai-contracts/src/searchObservationManagement.schemas.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Проверяет настройки, предварительный расчёт и подтверждение очистки диагностики.
 * @see documentation/architecture/repository-search.md
 */
import { z } from "zod";
import { SEARCH_OBSERVATION_SETTINGS_LIMITS as limits } from "./searchObservationManagement.constants";

export const searchObservationSettingsSchema = z.strictObject({
  retentionDays: z
    .number()
    .int()
    .min(limits.retentionDays.min)
    .max(limits.retentionDays.max),
  capacity: z.number().int().min(limits.capacity.min).max(limits.capacity.max),
  cleanupIntervalMinutes: z
    .number()
    .int()
    .min(limits.cleanupIntervalMinutes.min)
    .max(limits.cleanupIntervalMinutes.max),
});

export const searchObservationSettingsUpdateSchema = z.strictObject({
  expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  settings: searchObservationSettingsSchema,
});

export const searchObservationCleanupModeSchema = z.enum([
  "expired",
  "history",
]);
export const searchObservationCleanupPreviewSchema = z.strictObject({
  mode: searchObservationCleanupModeSchema,
  before: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export const searchObservationCleanupRequestSchema = z.strictObject({
  preview: searchObservationCleanupPreviewSchema,
});
