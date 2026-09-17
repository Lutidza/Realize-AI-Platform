/**
 * @file src/collections/Media/processMediaVariants.service.ts
 * @version 1.1.0
 * @date 2026-09-15
 * @description Создаёт проверенные версии изображений через Sharp, не изменяя исходник и состояние Payload.
 * @see documentation/specifications/media-management.md
 */

import { createHash } from "node:crypto";
import sharp from "sharp";
import type {
  ProcessedMediaSet,
  ProcessMediaVariantsInput,
} from "./MediaProcessing.types";
import { validateMediaRecipe } from "./validateMediaRecipe.validator";

const maxSourceBytes = 25 * 1024 * 1024;
const maxSourcePixels = 40_000_000;
const inputOptions = {
  limitInputPixels: maxSourcePixels,
  failOn: "warning" as const,
};
// Изменение алгоритма и библиотек создаёт новый набор, включая обновление кодеков.
export const mediaPipelineVersion = `media-inside-srgb-v1:${process.platform}:${process.arch}:${JSON.stringify(
  Object.entries(sharp.versions).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  ),
)}`;

function hash(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Возвращает только полностью рассчитанный набор. Persistence/Jobs сохраняют файлы
 * и переключают указатель отдельно; этот сервис не публикует URL и не пишет в БД.
 */
export async function processMediaVariants({
  source,
  recipe: inputRecipe,
}: ProcessMediaVariantsInput): Promise<ProcessedMediaSet> {
  const pipelineVersion = mediaPipelineVersion;
  const recipe = validateMediaRecipe(inputRecipe);
  if (
    !Buffer.isBuffer(source) ||
    source.length < 1 ||
    source.length > maxSourceBytes
  ) {
    throw new Error("Размер исходника должен быть от 1 байта до 25 MiB.");
  }
  // Снимок создаётся до первого await: последующая мутация входа не меняет задание.
  const original = Buffer.from(source);
  const metadata = await sharp(original, inputOptions).metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    !["jpeg", "png", "webp"].includes(metadata.format ?? "")
  ) {
    throw new Error("На этом этапе исходник должен быть JPEG, PNG или WebP.");
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw new Error(
      "Анимация и многостраничные исходники требуют отдельного профиля.",
    );
  }
  if (
    metadata.hasAlpha &&
    recipe.variants.some(({ format }) => format === "jpeg")
  ) {
    throw new Error(
      "Прозрачный исходник требует WebP/PNG; фон для JPEG ещё не настроен.",
    );
  }
  const sourceHash = hash(original);
  const recipeHash = hash(JSON.stringify(recipe));
  const variantSetID = hash(
    JSON.stringify({ sourceHash, recipeHash, pipelineVersion }),
  );
  const variants: ProcessedMediaSet["variants"] = [];
  let resultBytes = 0;
  // Последовательная обработка ограничивает число одновременно декодируемых копий.
  for (const variant of recipe.variants) {
    const image = sharp(original, inputOptions)
      .rotate()
      .toColourspace("srgb")
      .resize({ width: variant.width, fit: "inside", withoutEnlargement: true })
      .timeout({ seconds: 30 });
    if (variant.format === "png")
      image.png({ compressionLevel: variant.compressionLevel ?? 6 });
    else if (variant.format === "webp")
      image.webp({ quality: variant.quality, effort: 4 });
    else image.jpeg({ quality: variant.quality, mozjpeg: false });
    // Sharp по умолчанию убирает EXIF/GPS/ICC; оригинальные байты остаются отдельно.
    const { data, info } = await image.toBuffer({ resolveWithObject: true });
    resultBytes += data.length;
    if (resultBytes > 64 * 1024 * 1024) {
      throw new Error("Готовый набор превышает лимит 64 MiB.");
    }
    const actual = await sharp(data, inputOptions).metadata();
    if (
      info.format !== variant.format ||
      actual.width !== info.width ||
      actual.height !== info.height ||
      actual.exif ||
      actual.icc
    ) {
      throw new Error(
        "Полученный вариант не соответствует ожидаемым метаданным.",
      );
    }
    variants.push({
      slot: variant.slot,
      format: variant.format,
      filename: `${variantSetID}-${variant.slot}.${variant.format === "jpeg" ? "jpg" : variant.format}`,
      width: info.width,
      height: info.height,
      mimeType: `image/${variant.format}`,
      byteLength: data.length,
      contentHash: hash(data),
      data,
    });
  }
  return { sourceHash, recipeHash, variantSetID, pipelineVersion, variants };
}
