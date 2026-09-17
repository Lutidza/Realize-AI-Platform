/**
 * @file src/collections/Media/prepareMediaDisplayCopy.service.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Готовит очищенную совместимую копию Media.url, сохраняя исходные байты отдельно.
 * @see documentation/specifications/media-management.md
 */
import sharp from "sharp";
import { APIError } from "payload";

/** Это одна техническая копия; управляемая матрица размеров исполняется только Jobs. */
export async function prepareMediaDisplayCopy(source: Buffer) {
  if (!source.length || source.length > 25 * 1024 * 1024) {
    throw new APIError("Изображение должно быть не больше 25 MiB.", 400);
  }
  const options = { limitInputPixels: 40_000_000, failOn: "warning" as const };
  const metadata = await sharp(source, options).metadata();
  if (
    !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
    (metadata.pages ?? 1) !== 1
  ) {
    throw new APIError(
      "Профили поддерживают статические JPEG, PNG и WebP.",
      400,
    );
  }
  const data = await sharp(source, options)
    .rotate()
    .toColourspace("srgb")
    .resize({ width: 2400, withoutEnlargement: true, fit: "inside" })
    .webp({ quality: 85, effort: 4 })
    .timeout({ seconds: 30 })
    .toBuffer();
  return { data, sourceMimeType: `image/${metadata.format}` };
}
