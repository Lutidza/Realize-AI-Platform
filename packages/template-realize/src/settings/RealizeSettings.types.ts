/**
 * @file packages/template-realize/src/settings/RealizeSettings.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Выводит тип настроек Realize из единственного Zod контракта.
 */
import type { z } from "zod";
import type { realizeSettingsSchema } from "./realizeSettings.schemas";

/** Эти настройки принадлежат package renderer, сохранение и revision задаёт host. */
export type RealizeSettings = z.infer<typeof realizeSettingsSchema>;
