/**
 * @file src/collections/Media/validateMediaRecipe.validator.ts
 * @version 1.1.0
 * @date 2026-09-15
 * @description Проверяет ограниченный рецепт изображений и возвращает независимый канонический снимок.
 */

import type { MediaRecipe } from "./MediaProcessing.types";

const identifier = /^[a-z][a-z0-9-]{0,47}$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Ожидается объект рецепта изображения.");
  }
  return value as Record<string, unknown>;
}

function assertKeys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error("Рецепт содержит неподдерживаемые параметры.");
  }
}

/** Неизвестные поля отклоняются: неподдерживаемый crop нельзя молча проигнорировать. */
export function validateMediaRecipe(value: unknown): MediaRecipe {
  const input = record(value);
  assertKeys(input, ["profile", "version", "variants"]);
  if (typeof input.profile !== "string" || !identifier.test(input.profile)) {
    throw new Error("Неверный идентификатор профиля.");
  }
  if (!Number.isSafeInteger(input.version) || Number(input.version) < 1) {
    throw new Error("Версия профиля должна быть положительным целым числом.");
  }
  if (
    !Array.isArray(input.variants) ||
    input.variants.length < 1 ||
    input.variants.length > 16
  ) {
    throw new Error("Рецепт должен содержать от 1 до 16 вариантов.");
  }
  const identities = new Set<string>();
  const widths = new Map<string, number>();
  const variants = input.variants.map((item) => {
    const variant = record(item);
    assertKeys(variant, [
      "slot",
      "width",
      "format",
      "quality",
      "compressionLevel",
    ]);
    if (typeof variant.slot !== "string" || !identifier.test(variant.slot)) {
      throw new Error("Неверное имя размера.");
    }
    if (
      !Number.isSafeInteger(variant.width) ||
      Number(variant.width) < 1 ||
      Number(variant.width) > 8192
    ) {
      throw new Error("Ширина должна быть целым числом от 1 до 8192.");
    }
    const format = variant.format;
    if (format !== "webp" && format !== "jpeg" && format !== "png") {
      throw new Error("Этот формат результата пока не поддерживается.");
    }
    if (
      format === "png"
        ? variant.quality !== undefined
        : !Number.isSafeInteger(variant.quality) ||
          Number(variant.quality) < 1 ||
          Number(variant.quality) > 100
    ) {
      throw new Error(
        "Для WebP/JPEG требуется quality от 1 до 100; PNG сохраняется без потерь.",
      );
    }
    const identity = `${variant.slot}:${format}`;
    if (
      variant.compressionLevel !== undefined &&
      (format !== "png" ||
        !Number.isInteger(variant.compressionLevel) ||
        Number(variant.compressionLevel) < 0 ||
        Number(variant.compressionLevel) > 9)
    ) {
      throw new Error(
        "compressionLevel разрешён только для PNG и должен быть от 0 до 9.",
      );
    }
    const width = variant.width as number;
    if (
      identities.has(identity) ||
      (widths.has(variant.slot) && widths.get(variant.slot) !== width)
    ) {
      throw new Error(
        "Размер имеет повторный формат или несовместимые значения ширины.",
      );
    }
    identities.add(identity);
    widths.set(variant.slot, width);
    return Object.freeze({
      slot: variant.slot,
      width,
      format,
      ...(format === "png" ? {} : { quality: variant.quality as number }),
      ...(variant.compressionLevel === undefined
        ? {}
        : { compressionLevel: variant.compressionLevel as number }),
    });
  });
  variants.sort((left, right) => {
    const a = `${left.slot}:${left.format}`;
    const b = `${right.slot}:${right.format}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return Object.freeze({
    profile: input.profile,
    version: input.version as number,
    variants: Object.freeze(variants),
  });
}
