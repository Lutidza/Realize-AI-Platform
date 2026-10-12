/**
 * @file packages/template-realize/src/settings/realizeSettings.schemas.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Проверяет поддержанные настройки плотности и ширины панели Realize.
 * @see documentation/architecture/ui-kit.md
 */
import { z } from "zod";

/** Неизвестные поля и значения не проходят; defaults сохраняют reference geometry. */
export const realizeSettingsSchema = z.strictObject({
  density: z
    .enum(["comfortable", "compact"])
    .default("comfortable")
    .meta({
      title: "Плотность интерфейса",
      "x-enumLabels": { comfortable: "Просторно", compact: "Компактно" },
    }),
  panelWidth: z.number().int().min(220).max(400).default(280).meta({
    title: "Ширина боковой панели",
    description: "Ширина внутренней навигации на широком экране, в пикселях.",
  }),
});
