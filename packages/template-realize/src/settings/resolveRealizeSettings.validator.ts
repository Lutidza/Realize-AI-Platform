/**
 * @file packages/template-realize/src/settings/resolveRealizeSettings.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Детерминированно проверяет настройки и восстанавливает reference defaults.
 * @see documentation/architecture/ui-kit.md
 */
import type { TemplateSettings } from "@realize/template-contracts";
import type { RealizeSettings } from "./RealizeSettings.types";
import { realizeSettingsSchema } from "./realizeSettings.schemas";

/** Один и тот же вход разрешается одинаково на server/client; неверный input отклоняется. */
export function resolveRealizeSettings(
  input: TemplateSettings,
): RealizeSettings {
  return realizeSettingsSchema.parse(input);
}
