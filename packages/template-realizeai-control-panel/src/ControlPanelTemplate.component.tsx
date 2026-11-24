/**
 * @file packages/template-realizeai-control-panel/src/ControlPanelTemplate.component.tsx
 * @version 1.1.0
 * @date 2026-11-17
 * @description Разрешает выбранный рабочий макет через существующий template contract.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
"use client";
import {
  assertLayoutSlots,
  TemplateContractError,
} from "@realize/template-contracts";
import type { TemplatePresentationProps } from "@realize/template-contracts/react";
import { UiTemplateProvider } from "@realize/ui-kit";
import { controlPanelManifest } from "./controlPanelManifest.index";
import {
  controlPanelPalette,
  controlPanelUi,
  getControlPanelThemeStyle,
} from "./controlPanelTheme.config";
import { resolveControlPanelSettings } from "./settings/resolveControlPanelSettings.validator";
import {
  controlPanelDefaultLayoutId,
  controlPanelLayouts,
} from "./controlPanelLayouts.config";

/** Первый срез не объявляет auth/status/frontend и не формирует пункты меню из бизнес-данных. */
export function ControlPanelTemplate(props: TemplatePresentationProps) {
  if (props.target !== "admin")
    throw new TemplateContractError("UNSUPPORTED_TARGET");
  if (props.screen !== "workspace")
    throw new Error("Control Panel screen is not supported");
  if (props.paletteId !== controlPanelPalette.id)
    throw new TemplateContractError("UNKNOWN_PALETTE");
  if (!controlPanelPalette.modes.includes(props.mode))
    throw new TemplateContractError("UNSUPPORTED_MODE");
  // Пакет пока подключён только к пустому preview: функциональные модули не теряют действия молча.
  if (
    props.navigation.length ||
    props.capabilities ||
    props.breadcrumbs?.length ||
    props.pageActions?.length ||
    props.backAction ||
    typeof props.secondaryNavigation === "function"
  )
    throw new Error(
      "Control Panel first slice supports empty shell preview only",
    );
  const settings = resolveControlPanelSettings(props.settings);
  const layout = controlPanelLayouts.find(
    (item) => item.id === (settings.layoutId ?? controlPanelDefaultLayoutId),
  );
  if (!layout) throw new Error("Control Panel layout is not registered");
  const providedSlots = [
    ["brand", props.brand],
    ["topbar", props.context],
    ["sidebar", props.secondaryNavigation],
    ["panel-content", props.content],
    ["footer", props.footer],
  ]
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== false,
    )
    .map(([key]) => key as string);
  assertLayoutSlots(layout.descriptor, providedSlots);
  const Layout = layout.Component;
  return (
    <UiTemplateProvider
      templateId={controlPanelManifest.id}
      templateVersion={controlPanelManifest.version}
      palette={controlPanelPalette}
      ui={controlPanelUi}
      style={getControlPanelThemeStyle(settings)}
    >
      <Layout
        {...layout.frameProps}
        mode={props.mode}
        brand={props.brand}
        topbar={props.context}
        sidebar={props.secondaryNavigation}
        content={props.content}
        footer={props.footer}
      />
    </UiTemplateProvider>
  );
}
