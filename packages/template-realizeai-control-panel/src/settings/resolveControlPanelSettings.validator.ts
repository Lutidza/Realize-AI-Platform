/**
 * @file packages/template-realizeai-control-panel/src/settings/resolveControlPanelSettings.validator.ts
 * @version 1.0.0
 * @date 2026-11-11
 * @description Проверяет настройки Control Panel с сохранением наследования макета.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { TemplateSettings } from "@realize/template-contracts";
import { controlPanelSettingsSchema } from "./controlPanelSettings.schemas";

/** Чистая проверка одинакова для host и renderer; неизвестные настройки отклоняются. */
export function resolveControlPanelSettings(input: TemplateSettings) {
  return controlPanelSettingsSchema.parse(input);
}
