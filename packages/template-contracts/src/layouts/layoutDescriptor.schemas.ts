/**
 * @file packages/template-contracts/src/layouts/layoutDescriptor.schemas.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Проверяет сериализуемый контракт областей Admin-макета без React и editor component contracts.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import { z } from "zod";
import {
  elementIdentitySchema,
  elementOwnerRefSchema,
} from "@realize/element-registry";

/** Версия нового layout/template profile точная; legacy Pages версии этим parser не обрабатываются. */
export const layoutDefinitionVersionSchema = z
  .string()
  .max(128)
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
  );

/** Exact definition reference не является digest реализации или разрешением исполнения. */
export const layoutVersionedRefSchema = z.strictObject({
  identity: elementIdentitySchema,
  version: layoutDefinitionVersionSchema,
});

const nonemptyText = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine(
      (value) =>
        value.trim().length > 0 &&
        !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/.test(
          value,
        ),
    );

/** Slot keys — runtime ports первого profile; они не задают разрешения редактора на размещение компонентов. */
export const layoutSlotKeySchema = z.enum([
  "brand",
  "rail",
  "topbar",
  "sidebar",
  "panel-content",
  "footer",
]);

/** Region существует независимо от пустого содержимого; responsive скрытие принадлежит реализации. */
export const layoutRegionSchema = z.strictObject({
  key: z.enum(["rail", "topbar", "sidebar", "panel-content", "footer"]),
  emptyBehavior: z.literal("preserve"),
  slots: z.array(layoutSlotKeySchema).min(1).max(2),
});

/** Guide разрешается внутри поставки descriptor.owner; path не является URL, командой или import. */
export const layoutGuideSchema = z.strictObject({
  purpose: z.enum(["usage", "development"]),
  path: z.literal("README.md"),
  anchor: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u),
});

/** Первый известный profile описывает постоянный Admin frame и необязательную topbar region. */
export const layoutDescriptorSchema = z
  .strictObject({
    schemaVersion: z.literal("1.0"),
    identity: elementIdentitySchema,
    kind: z.literal("layout"),
    version: layoutDefinitionVersionSchema,
    title: nonemptyText(160),
    description: nonemptyText(1000),
    owner: elementOwnerRefSchema,
    template: elementIdentitySchema,
    target: z.literal("admin"),
    screen: z.literal("workspace"),
    profile: z.strictObject({
      id: z.literal("realize.admin-panel-frame"),
      version: z.literal("0.1.0"),
    }),
    regions: z.array(layoutRegionSchema).min(4).max(5),
    guides: z.array(layoutGuideSchema).min(1).max(8),
  })
  .superRefine((descriptor, context) => {
    const regions = new Set<string>();
    const slots = new Set<string>();
    const expectedSlots: Record<string, readonly string[]> = {
      rail: ["brand", "rail"],
      topbar: ["topbar"],
      sidebar: ["sidebar"],
      "panel-content": ["panel-content"],
      footer: ["footer"],
    };
    for (const [index, region] of descriptor.regions.entries()) {
      if (regions.has(region.key))
        context.addIssue({
          code: "custom",
          path: ["regions", index, "key"],
          message: "Duplicate region",
        });
      regions.add(region.key);
      const expected = expectedSlots[region.key];
      if (
        region.slots.length !== expected.length ||
        expected.some((slot) => !region.slots.some((value) => value === slot))
      )
        context.addIssue({
          code: "custom",
          path: ["regions", index, "slots"],
          message: "Region ports do not match profile",
        });
      for (const slot of region.slots) {
        if (slots.has(slot))
          context.addIssue({
            code: "custom",
            path: ["regions", index, "slots"],
            message: "Duplicate slot",
          });
        slots.add(slot);
      }
    }
    if (
      ["rail", "sidebar", "panel-content", "footer"].some(
        (key) => !regions.has(key),
      )
    )
      context.addIssue({
        code: "custom",
        path: ["regions"],
        message: "Required region is missing",
      });
    const guides = descriptor.guides.map((guide) =>
      JSON.stringify([guide.purpose, guide.path, guide.anchor]),
    );
    if (new Set(guides).size !== guides.length)
      context.addIssue({
        code: "custom",
        path: ["guides"],
        message: "Duplicate guide reference",
      });
  });
