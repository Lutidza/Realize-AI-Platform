// @vitest-environment node
/**
 * @file tests/int/mediaProfiles.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Проверяет ACL, неизменность ключа и native преобразование настроек профиля.
 */

import type { PayloadRequest, SanitizedCollectionConfig } from "payload";
import { describe, expect, it } from "vitest";
import { MediaProfiles } from "../../src/collections/Media/MediaProfiles.collection";
import { mapMediaProfileRecipe } from "../../src/collections/Media/mapMediaProfileRecipe.mapper";
import { validateMediaProfile } from "../../src/collections/Media/validateMediaProfile.hook";

const profile = {
  id: 4,
  name: "Товары",
  key: "product-photo",
  enabled: true,
  variants: [
    { id: "row-1", slot: "small", width: 640, format: "webp", quality: 80 },
  ],
};

function validate(data: Record<string, unknown>, originalDoc?: typeof profile) {
  return validateMediaProfile({
    collection: MediaProfiles as SanitizedCollectionConfig,
    context: {},
    data,
    originalDoc,
    operation: originalDoc ? "update" : "create",
    req: {} as PayloadRequest,
  });
}

describe("Штатная коллекция профилей обработки", () => {
  it("ограничивает документы и native историю администраторами", async () => {
    for (const action of [
      "create",
      "read",
      "readVersions",
      "update",
      "delete",
    ] as const) {
      const access = MediaProfiles.access?.[action];
      expect(access).toBeTypeOf("function");
      for (const [user, allowed] of [
        [null, false],
        [{ id: 3, roles: ["customer"] }, false],
        [{ id: 1, roles: ["admin"] }, true],
      ] as const) {
        expect(
          await access!({ req: { user } as unknown as PayloadRequest }),
        ).toBe(allowed);
      }
    }
    expect(MediaProfiles.versions).toEqual({ maxPerDoc: 100 });
  });

  it("проверяет частичное обновление вместе с исходными настройками", () => {
    expect(validate({ description: "Новое описание" }, profile)).toEqual({
      description: "Новое описание",
    });
    expect(() => validate({ key: "other-profile" }, profile)).toThrow(
      "invalid",
    );
  });

  it("не позволяет сохранить неверный ключ, дробную ширину и несовместимые варианты", () => {
    expect(() => validate({ ...profile, key: "Product Photo" })).toThrow();
    expect(() =>
      validate({
        ...profile,
        variants: [{ ...profile.variants[0], width: 640.5 }],
      }),
    ).toThrow();
    expect(() =>
      validate({
        ...profile,
        variants: [...profile.variants, ...profile.variants],
      }),
    ).toThrow();
    expect(() =>
      validate({
        ...profile,
        variants: [
          ...profile.variants,
          {
            slot: "small",
            width: 320,
            format: "jpeg",
            quality: 80,
          },
        ],
      }),
    ).toThrow();
  });

  it("проецирует native rows, включая переключение формата и PNG default6", () => {
    const recipe = mapMediaProfileRecipe(
      {
        ...profile,
        variants: [
          {
            id: "native-row",
            slot: "large",
            width: 1200,
            format: "png",
            quality: 80,
            compressionLevel: null,
          },
          {
            id: "native-row-2",
            slot: "small",
            width: 640,
            format: "webp",
            quality: 82,
            compressionLevel: 9,
          },
        ],
        createdAt: "ignored",
      },
      57,
    );
    expect(recipe).toEqual({
      profile: "product-photo",
      version: 57,
      variants: [
        { slot: "large", width: 1200, format: "png", compressionLevel: 6 },
        { slot: "small", width: 640, format: "webp", quality: 82 },
      ],
    });
    expect(Object.isFrozen(recipe.variants[0])).toBe(true);
  });

  it("отклоняет отсутствие качества и некорректное сжатие, не исправляя значения пользователя", () => {
    for (const variant of [
      { slot: "small", width: 640, format: "webp", quality: null },
      { slot: "small", width: 640, format: "png", compressionLevel: 10 },
      { slot: "small", width: 640, format: "png", compressionLevel: 3.5 },
      { slot: "small", width: 640, format: "png", compressionLevel: "6" },
    ]) {
      expect(() =>
        mapMediaProfileRecipe({ ...profile, variants: [variant] }, 1),
      ).toThrow();
    }
  });
});
