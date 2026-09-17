/**
 * @file src/collections/Media/mapMediaProfileRecipe.mapper.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Преобразует native поля профиля в проверенный рецепт без служебных полей Payload.
 */

import type { MediaRecipe } from "./MediaProcessing.types";
import { validateMediaRecipe } from "./validateMediaRecipe.validator";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Некорректные настройки профиля обработки.");
  }
  return value as Record<string, unknown>;
}

/** Скрытые настройки прежнего формата и native row IDs не входят в рецепт. */
export function mapMediaProfileRecipe(
  value: unknown,
  versionID: number,
): MediaRecipe {
  const profile = record(value);
  const variants = Array.isArray(profile.variants)
    ? profile.variants.map((value) => {
        const row = record(value);
        return {
          slot: row.slot,
          width: row.width,
          format: row.format,
          ...(row.format === "png"
            ? { compressionLevel: row.compressionLevel ?? 6 }
            : { quality: row.quality ?? undefined }),
        };
      })
    : profile.variants;
  return validateMediaRecipe({
    profile: profile.key,
    version: versionID,
    variants,
  });
}
