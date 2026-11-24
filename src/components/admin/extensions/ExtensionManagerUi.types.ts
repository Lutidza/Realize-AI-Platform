/**
 * @file src/components/admin/extensions/ExtensionManagerUi.types.ts
 * @version 1.1.0
 * @date 2026-11-12
 * @description Описывает stateless widgets каталога, назначения, плана и истории.
 */
import type {
  ExtensionAssignment,
  ExtensionCatalogEntryDto,
  ExtensionAppearancePlanDto,
  ExtensionAppearanceReceiptDto,
} from "@realize/payload-extension-manager/contracts";
import type {
  TemplateSettings,
  TemplateTarget,
} from "@realize/template-contracts";
import type { ExtensionAppearanceDraft } from "./ExtensionManager.types";

export type ExtensionAppearanceEditorProps = {
  entries: ExtensionCatalogEntryDto[];
  draft: ExtensionAppearanceDraft;
  active: ExtensionAssignment | null;
  revision: number;
  disabled: boolean;
  canPrepare: boolean;
  onTemplateChange: (key: string) => void;
  onPaletteChange: (id: string) => void;
  onModeChange: (mode: "light" | "dark") => void;
  onSettingsChange: (text: string) => void;
  onPrepare: () => void;
};
export type ExtensionSettingsFieldsProps = {
  schema: TemplateSettings;
  text: string;
  disabled: boolean;
  onChange: (text: string) => void;
};
export type ExtensionSettingField = {
  key: string;
  label: string;
  description?: string;
  required: boolean;
} & (
  | { type: "enum"; options: { value: string; label: string }[] }
  | { type: "integer"; minimum?: number; maximum?: number }
  | { type: "boolean" }
);
export type ExtensionSettingsReadResult =
  { valid: true; value: TemplateSettings } | { valid: false; message: string };
export type ExtensionAppearancePlanProps = {
  plan: ExtensionAppearancePlanDto;
  disabled: boolean;
  invalidReason: string | null;
  readiness?: ExtensionCatalogEntryDto["readiness"];
  onApply: () => void;
  onDiscard: () => void;
};
export type ExtensionAppearanceHistoryProps = {
  history: ExtensionAppearanceReceiptDto[];
  target: TemplateTarget;
  previous: ExtensionAssignment | null;
  disabled: boolean;
  onRecover: () => void;
};
