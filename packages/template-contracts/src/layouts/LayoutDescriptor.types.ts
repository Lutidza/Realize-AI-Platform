/**
 * @file packages/template-contracts/src/layouts/LayoutDescriptor.types.ts
 * @version 1.1.0
 * @date 2026-11-18
 * @description Выводит readonly layout contracts из строгих schemas без отдельной копии полей.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { z } from "zod";
import type {
  layoutDescriptorSchema,
  layoutGuideSchema,
  layoutRegionSchema,
  layoutSlotKeySchema,
  layoutVersionedRefSchema,
} from "./layoutDescriptor.schemas";
import type {
  templateLayoutCatalogInputSchema,
  templateLayoutCatalogSchema,
} from "./templateLayoutCatalog.schemas";
import type { layoutAssignmentBindingSchema } from "./layoutAssignmentBinding.schemas";

type ReadonlyLayoutValue<T> = T extends
  string | number | boolean | null | undefined
  ? T
  : T extends readonly (infer Item)[]
    ? readonly ReadonlyLayoutValue<Item>[]
    : { readonly [Key in keyof T]: ReadonlyLayoutValue<T[Key]> };

/** Authored descriptor до проверки branded identity tokens. */
export type LayoutDescriptorInput = z.input<typeof layoutDescriptorSchema>;
/** Detached immutable описание layout, не документ композиции. */
export type LayoutDescriptor = ReadonlyLayoutValue<
  z.output<typeof layoutDescriptorSchema>
>;
/** Именованный runtime port; возможность editor placement здесь не объявляется. */
export type LayoutSlotKey = z.output<typeof layoutSlotKeySchema>;
/** Region metadata с политикой пустого содержимого. */
export type LayoutRegion = ReadonlyLayoutValue<
  z.output<typeof layoutRegionSchema>
>;
/** Owner-bound ссылка на руководство внутри точного package source binding. */
export type LayoutGuide = ReadonlyLayoutValue<
  z.output<typeof layoutGuideSchema>
>;
/** Exact reference на определение выбранного layout/template profile. */
export type LayoutVersionedRef = ReadonlyLayoutValue<
  z.output<typeof layoutVersionedRefSchema>
>;
/** Wire input фиксации; допускается только exact reference, без defaults и ranges. */
export type LayoutAssignmentBindingInput = z.input<
  typeof layoutAssignmentBindingSchema
>;
/** Прочитанный snapshot без утверждения о каталоге, runtime installation или ACL. */
export type LayoutAssignmentBinding = ReadonlyLayoutValue<
  z.output<typeof layoutAssignmentBindingSchema>
>;
/** Authored release metadata без catalogHash. */
export type TemplateLayoutCatalogInput = z.input<
  typeof templateLayoutCatalogInputSchema
>;
/** Проверенный catalog без криптографического утверждения browser. */
export type ParsedTemplateLayoutCatalog = ReadonlyLayoutValue<
  z.output<typeof templateLayoutCatalogInputSchema>
> &
  Partial<Pick<TemplateLayoutCatalog, "catalogHash">>;
/** Serializable DTO; server builder проверяет hash, browser parser — только его формат. */
export type TemplateLayoutCatalog = ReadonlyLayoutValue<
  z.output<typeof templateLayoutCatalogSchema>
>;
/** Resolved alias не материализует inherited default в сохранённых settings. */
export type ResolvedTemplateLayout = Readonly<{
  localId: string;
  descriptor: LayoutDescriptor;
  reference: LayoutVersionedRef;
}>;
/** Стабильная диагностика layout validation без echo входных значений. */
export type LayoutContractErrorCode =
  | "INVALID_DESCRIPTOR"
  | "INVALID_CATALOG"
  | "INVALID_LAYOUT_BINDING"
  | "DUPLICATE_DESCRIPTOR"
  | "DUPLICATE_ALIAS"
  | "UNKNOWN_LAYOUT_REFERENCE"
  | "UNREFERENCED_DESCRIPTOR"
  | "TEMPLATE_MISMATCH"
  | "UNKNOWN_DEFAULT_LAYOUT"
  | "UNKNOWN_LAYOUT"
  | "UNSUPPORTED_SLOT"
  | "INVALID_SLOT_KEYS"
  | "HASH_MISMATCH"
  | "STALE_CATALOG";
