/**
 * @file src/components/admin/system-shell/SystemAdminTemplateProvider.types.ts
 * @version 1.2.0
 * @date 2026-10-12
 * @description Определяет нейтральный context выбранного compiled Admin шаблона.
 */

import type { PropsWithChildren } from "react";
import type {
  TemplateMode,
  TemplateSettings,
} from "@realize/template-contracts";
import type { TemplateDefinition } from "@realize/template-contracts/react";
import type { AdminTemplateSelection } from "./adminAppearance.types";

/** Effective settings проверены compiled пакетом; host не знает его частных полей. */
export type SystemAdminTemplateContextValue = {
  definition: TemplateDefinition;
  selection: AdminTemplateSelection;
  settings: TemplateSettings;
  mode: TemplateMode;
  setMode: (mode: TemplateMode) => void;
  nativeAdminEnabled: boolean;
};

/** Host передаёт проверенные effective settings; props не исполняют persistence или delivery. */
export type SystemAdminTemplateProviderProps = PropsWithChildren<{
  selection?: AdminTemplateSelection;
  settings?: TemplateSettings;
  initialMode?: TemplateMode;
  /** Host capability передаётся сервером и наследуется вложенным candidate provider. */
  nativeAdminEnabled?: boolean;
}>;
