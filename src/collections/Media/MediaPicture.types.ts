/**
 * @file src/collections/Media/MediaPicture.types.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Задаёт явную проекцию закреплённого набора медиа для native picture.
 */

export type MediaPictureFormat = "jpeg" | "png" | "webp";
export type MediaPictureMimeType = "image/jpeg" | "image/png" | "image/webp";

/** Серверная проекция сохранённого варианта; доступ к URL проверяет вызывающий resolver. */
export interface MediaPictureVariantRecord {
  variantSetID: string;
  sourceHash: string;
  status: "ready" | "pending" | "failed";
  slot: string;
  format: MediaPictureFormat;
  url: string;
  width: number;
  height: number;
  mimeType: MediaPictureMimeType;
}

/** Manifest задаёт полный ожидаемый набор, независимо от числа найденных записей. */
export interface MapReadyMediaPictureInput {
  variantSetID: string;
  sourceHash: string;
  alt: string;
  expectedVariants: ReadonlyArray<{
    slot: string;
    format: MediaPictureFormat;
  }>;
  variants: readonly MediaPictureVariantRecord[];
}

/** Только атрибуты доставки изображения: без документов Payload, исходника и ключей storage. */
export interface MediaPictureDTO {
  version: "1.0";
  alt: string;
  fallback: {
    url: string;
    width: number;
    height: number;
    mimeType: MediaPictureMimeType;
  };
  sources: Array<{
    mimeType: MediaPictureMimeType;
    srcSet: string;
  }>;
}
