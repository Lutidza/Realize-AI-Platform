/**
 * @file packages/template-realize/src/realizeTemplate.definition.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Собирает compiled Realize definition из одного паспорта и package-owned реализаций.
 * @see documentation/architecture/ui-kit.md
 */
import type { TemplateDefinition } from "@realize/template-contracts/react";
import { RealizeTemplate } from "./RealizeTemplate.component";
import { realizeTemplateManifest } from "./realizeTemplateManifest.index";
import { realizeTemplatePalettes } from "./palettes/realizeTemplatePalettes.config";
import { realizeTemplateUi } from "./primitives/realizeTemplateUi.config";
import { resolveRealizeSettings } from "./settings/resolveRealizeSettings.validator";
import { getRealizeThemeStyle } from "./settings/getRealizeThemeStyle.util";

/** Compiled renderer/ui не строятся из JSON; host выбирает exact ID/version через общий SDK. */
export const realizeTemplateDefinition: TemplateDefinition = {
  manifest: realizeTemplateManifest,
  palettes: realizeTemplatePalettes,
  ui: realizeTemplateUi,
  Renderer: RealizeTemplate,
  resolveSettings: resolveRealizeSettings,
  getThemeStyle: getRealizeThemeStyle,
};
