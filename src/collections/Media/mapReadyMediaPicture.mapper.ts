/**
 * @file src/collections/Media/mapReadyMediaPicture.mapper.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Проецирует только полный готовый набор одной версии в безопасные атрибуты picture.
 * @see documentation/specifications/media-management.md
 */
import type {
  MapReadyMediaPictureInput,
  MediaPictureDTO,
  MediaPictureFormat,
  MediaPictureMimeType,
  MediaPictureVariantRecord,
} from "./MediaPicture.types";

const MIME_TYPES: Record<MediaPictureFormat, MediaPictureMimeType> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const SOURCE_FORMATS: MediaPictureFormat[] = ["webp", "png", "jpeg"];
const FALLBACK_FORMATS: MediaPictureFormat[] = ["jpeg", "png", "webp"];

function isDeliveryUrl(value: string): boolean {
  // Пробелы и запятые разделяют srcset; не превращаем URL в дополнительные кандидаты.
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 4096 ||
    /[\s,\u0000-\u001f\u007f\\]/u.test(value)
  ) {
    return false;
  }
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function isIdentifier(value: string): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

/**
 * URL должны прийти из разрешённого сервером storage resolver после проверки доступа.
 * Отсутствующая версия, неполный manifest или неоднозначная геометрия закрывают выдачу;
 * поиск latest, чтение файлов и запуск преобразований здесь отсутствуют.
 */
export function mapReadyMediaPicture(
  input: MapReadyMediaPictureInput,
): MediaPictureDTO | null {
  const { variantSetID, sourceHash, alt, expectedVariants, variants } = input;
  if (
    !isIdentifier(variantSetID) ||
    !isIdentifier(sourceHash) ||
    typeof alt !== "string" ||
    alt.length > 2000 ||
    expectedVariants.length === 0 ||
    expectedVariants.length > 128 ||
    variants.length > 512
  ) {
    return null;
  }

  const expectedKeys = new Set<string>();
  for (const expected of expectedVariants) {
    if (
      !isIdentifier(expected.slot) ||
      !Object.hasOwn(MIME_TYPES, expected.format)
    ) {
      return null;
    }
    const key = JSON.stringify([expected.slot, expected.format]);
    if (expectedKeys.has(key)) return null;
    expectedKeys.add(key);
  }

  const selected = variants.filter(
    (variant) =>
      variant.variantSetID === variantSetID &&
      variant.sourceHash === sourceHash,
  );
  if (selected.length !== expectedKeys.size) return null;

  const seenKeys = new Set<string>();
  const grouped = new Map<MediaPictureFormat, MediaPictureVariantRecord[]>();
  for (const variant of selected) {
    const key = JSON.stringify([variant.slot, variant.format]);
    if (
      !expectedKeys.has(key) ||
      seenKeys.has(key) ||
      variant.status !== "ready" ||
      !Object.hasOwn(MIME_TYPES, variant.format) ||
      variant.mimeType !== MIME_TYPES[variant.format] ||
      !Number.isSafeInteger(variant.width) ||
      !Number.isSafeInteger(variant.height) ||
      variant.width <= 0 ||
      variant.height <= 0 ||
      !isDeliveryUrl(variant.url)
    ) {
      return null;
    }
    seenKeys.add(key);
    const group = grouped.get(variant.format) ?? [];
    group.push(variant);
    grouped.set(variant.format, group);
  }

  const largest = selected.reduce((best, next) =>
    next.width > best.width ? next : best,
  );
  for (const variant of selected) {
    // Округление размера Sharp допускает расхождение до одного пикселя высоты.
    const expectedHeight = (variant.width * largest.height) / largest.width;
    if (Math.abs(variant.height - expectedHeight) > 1) return null;
  }

  const sources: MediaPictureDTO["sources"] = [];
  for (const format of SOURCE_FORMATS) {
    const group = grouped.get(format);
    if (!group) continue;
    group.sort(
      (left, right) =>
        left.width - right.width ||
        (left.slot < right.slot ? -1 : left.slot > right.slot ? 1 : 0),
    );
    const candidates: MediaPictureVariantRecord[] = [];
    for (const variant of group) {
      const previous = candidates[candidates.length - 1];
      if (previous?.width === variant.width) {
        if (previous.height !== variant.height) return null;
        // Без upscale несколько слотов могут иметь один фактический размер.
        continue;
      }
      candidates.push(variant);
    }
    sources.push({
      mimeType: MIME_TYPES[format],
      srcSet: candidates
        .map((variant) => `${variant.url} ${variant.width}w`)
        .join(", "),
    });
  }
  const fallbackGroup = grouped.get(
    FALLBACK_FORMATS.find((format) => grouped.has(format))!,
  )!;
  const fallback = fallbackGroup[fallbackGroup.length - 1]!;
  return {
    version: "1.0",
    alt,
    fallback: {
      url: fallback.url,
      width: fallback.width,
      height: fallback.height,
      mimeType: fallback.mimeType,
    },
    sources,
  };
}
