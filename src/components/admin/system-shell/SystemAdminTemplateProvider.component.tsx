/**
 * @file src/components/admin/system-shell/SystemAdminTemplateProvider.component.tsx
 * @version 1.2.0
 * @date 2026-11-11
 * @description Связывает строгий выбор compiled Admin пакета с UI context без лишнего DOM.
 * @see documentation/architecture/system-admin-shell.md
 */

"use client";
import { useCallback, useContext, useMemo, useState } from "react";
import {
  resolveTemplateSelection,
  type TemplateMode,
} from "@realize/template-contracts";
import { UiTemplateProvider } from "@realize/ui-kit";
import { adminAppearanceConfig } from "./adminAppearance.config";
import { SYSTEM_ADMIN_TEMPLATES } from "./systemAdminTemplates.registry";
import { SYSTEM_ADMIN_TEMPLATE_CONTEXT } from "./systemAdminTemplate.constants";
import type { SystemAdminTemplateProviderProps } from "./SystemAdminTemplateProvider.types";

/** Provider охватывает также domain dialogs за пределами renderer и сохраняет их UI context. */
export function SystemAdminTemplateProvider({
  children,
  selection = adminAppearanceConfig.selection,
  settings = adminAppearanceConfig.settings,
  initialMode,
  mode: controlledMode,
  onModeChange,
  nativeAdminEnabled,
}: SystemAdminTemplateProviderProps) {
  const parent = useContext(SYSTEM_ADMIN_TEMPLATE_CONTEXT);
  const nativeEnabled =
    nativeAdminEnabled ?? parent?.nativeAdminEnabled ?? true;
  const [localMode, setLocalMode] = useState(initialMode ?? selection.mode);
  const mode = controlledMode ?? localMode;
  const setMode = useCallback(
    (next: TemplateMode) => {
      if (controlledMode === undefined) setLocalMode(next);
      onModeChange?.(next);
    },
    [controlledMode, onModeChange],
  );
  const resolved = useMemo(
    () =>
      resolveTemplateSelection({
        manifests: SYSTEM_ADMIN_TEMPLATES.map(
          (definition) => definition.manifest,
        ),
        selection: { ...selection, mode },
        host: adminAppearanceConfig.host,
      }),
    [selection, mode],
  );
  const definition = SYSTEM_ADMIN_TEMPLATES.find(
    (candidate) =>
      candidate.manifest.id === resolved.manifest.id &&
      candidate.manifest.version === resolved.manifest.version,
  );
  if (!definition) throw new Error("Compiled Admin template is not registered");
  const palette = definition.palettes.find(
    (candidate) =>
      candidate.id === resolved.palette.id &&
      candidate.version === resolved.palette.version &&
      candidate.modes.includes(mode),
  );
  if (!palette)
    throw new Error("Compiled Admin palette does not match its manifest");
  const effectiveSettings = useMemo(() => {
    const snapshot = { ...definition.manifest.settings.defaults, ...settings };
    return definition.resolveSettings
      ? definition.resolveSettings(snapshot)
      : snapshot;
  }, [definition, settings]);
  const style = useMemo(
    () => definition.getThemeStyle?.(effectiveSettings, mode),
    [definition, effectiveSettings, mode],
  );
  const value = useMemo(
    () => ({
      definition,
      selection: { ...selection, mode },
      settings: effectiveSettings,
      mode,
      setMode,
      nativeAdminEnabled: nativeEnabled,
    }),
    [definition, selection, effectiveSettings, mode, setMode, nativeEnabled],
  );
  return (
    <SYSTEM_ADMIN_TEMPLATE_CONTEXT.Provider value={value}>
      <UiTemplateProvider
        templateId={definition.manifest.id}
        templateVersion={definition.manifest.version}
        palette={palette}
        ui={definition.ui}
        style={style}
      >
        {children}
      </UiTemplateProvider>
    </SYSTEM_ADMIN_TEMPLATE_CONTEXT.Provider>
  );
}
