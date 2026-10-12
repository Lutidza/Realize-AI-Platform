/**
 * @file packages/ui-kit/src/template-runtime/UiTemplateRuntime.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Описывает выбранный UI adapter и оформление без доступа к host данным.
 * @see documentation/architecture/ui-kit.md
 */
import type { CSSProperties, PropsWithChildren } from "react";
import type {
  TemplatePaletteDefinition,
  TemplateUiAdapter,
} from "@realize/template-contracts/react";

/** Provider не выбирает пакет и не доказывает его установку; definition разрешает host. */
export type UiTemplateRuntime = {
  templateId: string;
  templateVersion: string;
  palette: TemplatePaletteDefinition;
  ui: TemplateUiAdapter;
  style?: CSSProperties;
};
export type UiTemplateProviderProps = PropsWithChildren<UiTemplateRuntime>;
