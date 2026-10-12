/**
 * @file packages/template-contracts/src/TemplateDefinition.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Связывает проверенный manifest с скомпилированными exports пакета.
 */

import type { ComponentType, CSSProperties } from "react";
import type { TemplateManifest, TemplateMode } from "./TemplateManifest.types";
import type { TemplatePresentationProps } from "./TemplatePresentation.types";
import type { TemplateUiAdapter } from "./TemplatePrimitives.types";
import type { TemplateSettings } from "./TemplateValue.types";

/** Ограниченная style-карта semantic tokens, включая CSS custom properties. */
export type TemplateThemeStyle = CSSProperties & {
  [property: `--${string}`]: string | number | undefined;
};

/** CSS импортирован самим пакетом; className не является URL или динамическим import. */
export type TemplatePaletteDefinition = {
  readonly id: string;
  readonly version: string;
  readonly className: string;
  readonly modes: readonly TemplateMode[];
};

/** Host регистрирует compiled definition, не выполняет код из JSON manifest. */
export type TemplateDefinition = {
  readonly manifest: TemplateManifest;
  readonly palettes: readonly TemplatePaletteDefinition[];
  readonly ui: TemplateUiAdapter;
  readonly Renderer: ComponentType<TemplatePresentationProps>;
  /** Pure compiled validator; одинаковый input детерминированно проверяется в SSR/client. */
  readonly resolveSettings?: (input: TemplateSettings) => TemplateSettings;
  /** Pure token projection, применяется host ко всем UI roots/portals без знания частных settings. */
  readonly getThemeStyle?: (
    settings: TemplateSettings,
    mode: TemplateMode,
  ) => TemplateThemeStyle;
};
