/**
 * @file src/components/admin/system-shell/SystemAdminTemplateHost.component.tsx
 * @version 1.1.0
 * @date 2026-10-12
 * @description Передаёт нейтральную модель страницы выбранному compiled renderer.
 * @see documentation/architecture/system-admin-shell.md
 */

"use client";
import type { TemplateMode } from "@realize/template-contracts";
import type { TemplatePresentationProps } from "@realize/template-contracts/react";
import { useSystemAdminTemplate } from "./useSystemAdminTemplate.hook";
import type { SystemAdminTemplateHostProps } from "./SystemAdminTemplateHost.types";
import { filterSystemAdminNavigation } from "./filterSystemAdminNavigation.util";

/** Domain controller остаётся у вызывающего модуля; host не импортирует concrete layout. */
export function SystemAdminTemplateHost({
  children,
  ...props
}: SystemAdminTemplateHostProps) {
  const { definition, selection, settings, setMode, nativeAdminEnabled } =
    useSystemAdminTemplate();
  const target = definition.manifest.targets.find(
    (entry) => entry.target === "admin",
  );
  if (!target?.screens.includes(props.screen)) {
    throw new Error("Admin screen is not supported by the selected template");
  }
  const Renderer = definition.Renderer;
  const handleModeChange = (mode: TemplateMode) => {
    setMode(mode);
    props.onModeChange?.(mode);
  };
  const model: TemplatePresentationProps = {
    ...props,
    ...(props.screen === "workspace"
      ? {
          navigation: filterSystemAdminNavigation(
            props.navigation,
            nativeAdminEnabled,
          ),
        }
      : {}),
    target: "admin",
    paletteId: selection.paletteId,
    settings,
    content: children,
    onModeChange: props.onModeChange ? handleModeChange : undefined,
  };
  return <Renderer {...model} />;
}
