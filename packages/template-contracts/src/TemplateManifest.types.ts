/**
 * @file packages/template-contracts/src/TemplateManifest.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Экспортирует проверяемые DTO manifest, host и точного выбора пакета.
 */

import type { z } from "zod";
import type {
  templateHostCompatibilitySchema,
  templateManifestSchema,
  templateSelectionSchema,
} from "./templateManifest.schemas";

/** Единственная serializable schema для host, packager и installer. */
export type TemplateManifest = z.infer<typeof templateManifestSchema>;
/** Назначение поверхности использует точные версии template и palette. */
export type TemplateSelection = z.infer<typeof templateSelectionSchema>;
/** Host передаёт проверенные версии и необходимые возможности поверхности. */
export type TemplateHostCompatibility = z.infer<
  typeof templateHostCompatibilitySchema
>;
export type TemplateTarget = TemplateSelection["target"];
export type TemplateMode = TemplateSelection["mode"];
export type TemplateCapabilityId = NonNullable<
  TemplateHostCompatibility["requiredCapabilities"]
>[number];
export type TemplatePaletteManifest = TemplateManifest["palettes"][number];

/** Код отказа не включает исходные настройки и недоверенное содержимое пакета. */
export type TemplateContractErrorCode =
  | "INVALID_MANIFEST"
  | "INVALID_SELECTION"
  | "INVALID_HOST"
  | "DUPLICATE_TEMPLATE"
  | "UNKNOWN_TEMPLATE"
  | "UNSUPPORTED_TARGET"
  | "INCOMPATIBLE_HOST"
  | "MISSING_CAPABILITY"
  | "UNKNOWN_PALETTE"
  | "UNSUPPORTED_MODE";

/** Результат выбора известного manifest; не доказывает установку, доверие или readiness. */
export type ResolvedTemplateSelection = {
  manifest: TemplateManifest;
  palette: TemplatePaletteManifest;
  selection: TemplateSelection;
};
