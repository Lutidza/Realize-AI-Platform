/**
 * @file src/collections/Media/validateMediaProfile.hook.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Сохраняет постоянный ключ профиля и проверяет совместимость его вариантов.
 */

import { ValidationError, type CollectionBeforeChangeHook } from "payload";
import { mapMediaProfileRecipe } from "./mapMediaProfileRecipe.mapper";

export const validateMediaProfile: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (
    operation === "update" &&
    data.key !== undefined &&
    data.key !== originalDoc?.key
  ) {
    throw new ValidationError({
      collection: "media-profiles",
      req,
      errors: [
        { path: "key", message: "Ключ существующего профиля нельзя изменить." },
      ],
    });
  }
  try {
    // Native version ID появится после записи; здесь единица служит только проверке формы рецепта.
    mapMediaProfileRecipe({ ...originalDoc, ...data }, 1);
  } catch (error) {
    throw new ValidationError({
      collection: "media-profiles",
      req,
      errors: [
        {
          path: "variants",
          message:
            error instanceof Error
              ? error.message
              : "Проверьте настройки вариантов.",
        },
      ],
    });
  }
  return data;
};
