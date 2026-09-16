// @vitest-environment node
/**
 * @file tests/int/mediaProcessing.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Проверяет реальные варианты Sharp, неизменность исходников, версии и ограничение обработки.
 */

import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processMediaVariants } from "../../src/collections/Media/processMediaVariants.service";
import { validateMediaRecipe } from "../../src/collections/Media/validateMediaRecipe.validator";
import type { MediaRecipe } from "../../src/collections/Media/MediaProcessing.types";

const recipe: MediaRecipe = {
  profile: "photo",
  version: 1,
  variants: [
    { slot: "small", width: 320, format: "webp", quality: 80 },
    { slot: "medium", width: 640, format: "webp", quality: 80 },
    { slot: "small", width: 320, format: "jpeg", quality: 82 },
  ],
};

async function sourceImage() {
  const pixels = Buffer.alloc(900 * 600 * 3);
  for (let index = 0; index < pixels.length; index++) {
    pixels[index] = (index * 31 + Math.floor(index / 271)) % 256;
  }
  return sharp(pixels, { raw: { width: 900, height: 600, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe("Версионированная обработка Media", () => {
  it("сохраняет исходник и старые байты при изменении качества; retry даёт тот же набор", async () => {
    const source = await sourceImage();
    const originalHash = createHash("sha256").update(source).digest("hex");
    const first = await processMediaVariants({ source, recipe });
    const snapshots = first.variants.map(({ data }) => Buffer.from(data));
    const second = await processMediaVariants({
      source,
      recipe: {
        ...recipe,
        version: 2,
        variants: recipe.variants.map((v) => ({ ...v, quality: 45 })),
      },
    });
    const retry = await processMediaVariants({
      source,
      recipe: { ...recipe, variants: [...recipe.variants].reverse() },
    });
    expect(first.sourceHash).toBe(originalHash);
    expect(second.sourceHash).toBe(originalHash);
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      originalHash,
    );
    expect(second.variantSetID).not.toBe(first.variantSetID);
    expect(retry).toEqual(first);
    for (const [index, variant] of first.variants.entries()) {
      expect(variant.data).toEqual(snapshots[index]);
      expect(variant.filename).not.toBe(second.variants[index].filename);
      expect(variant.contentHash).not.toBe(second.variants[index].contentHash);
      expect(variant.byteLength).toBe(variant.data.length);
      const actual = await sharp(variant.data).metadata();
      expect([actual.width, actual.height, actual.format]).toEqual([
        variant.width,
        variant.height,
        variant.format,
      ]);
      expect(variant.width).toBe(variant.slot === "small" ? 320 : 640);
    }
  });

  it("нормализует ориентацию, удаляет EXIF и не увеличивает небольшой исходник", async () => {
    const source = await sharp({
      create: { width: 120, height: 80, channels: 3, background: "#aa3344" },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const before = await sharp(source).metadata();
    expect(before.exif).toBeDefined();
    const result = await processMediaVariants({ source, recipe });
    for (const variant of result.variants) {
      expect([variant.width, variant.height]).toEqual([80, 120]);
      const actual = await sharp(variant.data).metadata();
      expect(actual.exif).toBeUndefined();
      expect(actual.icc).toBeUndefined();
      expect(actual.space).toBe("srgb");
    }
    expect(await sharp(source).metadata()).toEqual(before);
  });

  it("сохраняет прозрачность PNG/WebP и отклоняет её неявную потерю в JPEG", async () => {
    const source = await sharp({
      create: {
        width: 32,
        height: 20,
        channels: 4,
        background: { r: 20, g: 40, b: 60, alpha: 0.3 },
      },
    })
      .png()
      .toBuffer();
    const result = await processMediaVariants({
      source,
      recipe: {
        profile: "logo",
        version: 1,
        variants: [
          { slot: "small", width: 320, format: "png" },
          { slot: "small", width: 320, format: "webp", quality: 90 },
        ],
      },
    });
    for (const variant of result.variants)
      expect((await sharp(variant.data).metadata()).hasAlpha).toBe(true);
    await expect(processMediaVariants({ source, recipe })).rejects.toThrow(
      "Прозрачный исходник",
    );
  });

  it("фиксирует входные байты и рецепт до первого await, не смешивая параллельные запросы", async () => {
    const source = await sourceImage();
    const copy = Buffer.from(source);
    const mutableRecipe = {
      profile: "photo",
      version: 1,
      variants: [
        { slot: "small", width: 320, format: "webp" as const, quality: 80 },
      ],
    };
    const pending = processMediaVariants({ source, recipe: mutableRecipe });
    mutableRecipe.variants[0].width = 20;
    source.fill(0);
    const [result, separate] = await Promise.all([
      pending,
      processMediaVariants({
        source: copy,
        recipe: { ...mutableRecipe, version: 2 },
      }),
    ]);
    expect(result.variants[0].width).toBe(320);
    expect(separate.variants[0].width).toBe(20);
    expect(result.sourceHash).toBe(separate.sourceHash);
    expect(result.variantSetID).not.toBe(separate.variantSetID);
  });

  it("отклоняет повреждённые, слишком большие, SVG и анимированные входы", async () => {
    await expect(
      processMediaVariants({ source: Buffer.from("broken"), recipe }),
    ).rejects.toThrow();
    await expect(
      processMediaVariants({
        source: Buffer.alloc(25 * 1024 * 1024 + 1),
        recipe,
      }),
    ).rejects.toThrow("25 MiB");
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );
    await expect(processMediaVariants({ source: svg, recipe })).rejects.toThrow(
      "JPEG, PNG или WebP",
    );
    const frames = Buffer.alloc(2 * 2 * 4 * 2, 120);
    frames.fill(240, 2 * 2 * 4);
    const animated = await sharp(frames, {
      raw: { width: 2, height: 4, channels: 4, pageHeight: 2 },
    })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(
      2,
    );
    await expect(
      processMediaVariants({ source: animated, recipe }),
    ).rejects.toThrow("Анимация");
  });

  it("отклоняет неподдерживаемые параметры и неоднозначные размеры до обработки", () => {
    const variant = recipe.variants[0];
    const invalid = [
      { ...recipe, crop: { left: 0 } },
      { ...recipe, profile: "../../photo" },
      { ...recipe, version: 0 },
      { ...recipe, variants: [] },
      { ...recipe, variants: Array(17).fill(variant) },
      { ...recipe, variants: [variant, variant] },
      {
        ...recipe,
        variants: [{ ...variant, width: Number.POSITIVE_INFINITY }],
      },
      { ...recipe, variants: [{ ...variant, quality: 101 }] },
      { ...recipe, variants: [{ ...variant, format: "png" }] },
      { ...recipe, variants: [{ ...variant, format: "avif" }] },
      {
        ...recipe,
        variants: [variant, { ...variant, format: "jpeg", width: 600 }],
      },
    ];
    for (const value of invalid)
      expect(() => validateMediaRecipe(value)).toThrow();
  });
});
