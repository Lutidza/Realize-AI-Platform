/**
 * @file packages/template-realize/src/RealizeTemplate.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Выбирает поддержанный Admin screen и передаёт весь UI через Realize provider.
 * @see documentation/specifications/design-workshop.md
 */
"use client";
import { TemplateContractError } from "@realize/template-contracts";
import type { TemplatePresentationProps } from "@realize/template-contracts/react";
import { UiTemplateProvider } from "@realize/ui-kit";
import { realizeTemplateManifest } from "./realizeTemplateManifest.index";
import { realizeTemplatePalettes } from "./palettes/realizeTemplatePalettes.config";
import { realizeTemplateUi } from "./primitives/realizeTemplateUi.config";
import { getRealizeThemeStyle } from "./settings/getRealizeThemeStyle.util";
import { resolveRealizeSettings } from "./settings/resolveRealizeSettings.validator";
import { RealizeAdminWorkspace } from "./layouts/RealizeAdminWorkspace.component";
import { RealizeAdminAuthLayout } from "./layouts/RealizeAdminAuthLayout.component";
import { RealizeAdminStatusLayout } from "./layouts/RealizeAdminStatusLayout.component";

/** Пакет объявляет только Admin: frontend не превращается в ложную placeholder страницу. */
export function RealizeTemplate(props: TemplatePresentationProps) {
  if (props.target !== "admin")
    throw new TemplateContractError("UNSUPPORTED_TARGET");
  const palette = realizeTemplatePalettes.find(
    (item) => item.id === props.paletteId,
  );
  if (!palette) throw new TemplateContractError("UNKNOWN_PALETTE");
  if (!palette.modes.includes(props.mode))
    throw new TemplateContractError("UNSUPPORTED_MODE");
  const settings = resolveRealizeSettings(props.settings);
  const style = getRealizeThemeStyle(settings);
  const screen =
    props.screen === "workspace" ? (
      <RealizeAdminWorkspace {...props} settings={settings} />
    ) : props.screen === "auth" ? (
      <RealizeAdminAuthLayout {...props} settings={settings} />
    ) : (
      <RealizeAdminStatusLayout {...props} settings={settings} />
    );
  return (
    <UiTemplateProvider
      templateId={realizeTemplateManifest.id}
      templateVersion={realizeTemplateManifest.version}
      palette={palette}
      ui={realizeTemplateUi}
      style={style}
    >
      {screen}
    </UiTemplateProvider>
  );
}
