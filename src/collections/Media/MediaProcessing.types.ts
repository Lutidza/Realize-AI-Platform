/**
 * @file src/collections/Media/MediaProcessing.types.ts
 * @version 1.1.0
 * @date 2026-09-15
 * @description Описывает неизменяемый рецепт обработки и готовые файлы до сохранения в Payload.
 * @see documentation/specifications/media-management.md
 */

export type MediaOutputFormat = "webp" | "jpeg" | "png";

/** Этап 0: пропорциональное уменьшение без кадрирования и увеличения исходника. */
export type MediaRecipe = Readonly<{
  profile: string;
  version: number;
  variants: readonly Readonly<{
    slot: string;
    width: number;
    format: MediaOutputFormat;
    /** Обязательно для lossy WebP/JPEG; PNG сохраняется без потерь. */
    quality?: number;
    /** Уровень сжатия PNG без потерь, 0–9; по умолчанию 6. */
    compressionLevel?: number;
  }>[];
}>;

export type ProcessedMediaVariant = {
  slot: string;
  format: MediaOutputFormat;
  filename: string;
  width: number;
  height: number;
  mimeType: string;
  byteLength: number;
  contentHash: string;
  data: Buffer;
};

/** Внутренний результат сервиса; Buffer и технические hashes не являются UI DTO. */
export type ProcessedMediaSet = {
  sourceHash: string;
  recipeHash: string;
  variantSetID: string;
  pipelineVersion: string;
  variants: ProcessedMediaVariant[];
};

export type ProcessMediaVariantsInput = {
  source: Buffer;
  recipe: MediaRecipe;
};

/** Внутренние исходные байты перед native преобразованием; не являются публичным DTO. */
export type MediaUploadSource = {
  data: Buffer;
  name: string;
  mimetype: string;
};
