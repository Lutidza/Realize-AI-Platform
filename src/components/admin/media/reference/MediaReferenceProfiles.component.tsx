/**
 * @file src/components/admin/media/reference/MediaReferenceProfiles.component.tsx
 * @version 1.0.0
 * @date 2026-09-14
 * @description Редактор демонстрационных профилей с доступной валидацией.
 * @see documentation/specifications/media-management-references.md
 */

import {
  UiButton,
  UiInput,
  UiNotice,
  UiSelect,
  UiSurface,
} from "@realize/ui-kit";
import { useId } from "react";
import type { Profile, ScreenProps } from "./MediaReference.types";
import { purposes } from "./mediaReference.fixtures";
import styles from "./MediaReferenceWorkbench.module.css";

export function MediaReferenceProfiles({ model }: ScreenProps) {
  const id = useId();
  return (
    <section className={styles.stack}>
      <h2>Профили</h2>
      <UiNotice>Параметры примера. Обработка не подключена</UiNotice>
      <label className={styles.field}>
        Профиль
        <UiSelect
          value={model.profile}
          onChange={(event) =>
            model.setProfile(event.target.value as typeof model.profile)
          }
        >
          {purposes.map((purpose) => (
            <option key={purpose}>{purpose}</option>
          ))}
        </UiSelect>
      </label>
      <p>Исходные значения — демонстрационные.</p>
      {(["small", "medium", "large"] as (keyof Profile)[]).map((size) => {
        const variant = model.profiles[model.profile][size];
        const errors = model.profileErrors(variant);
        return (
          <UiSurface key={size} asChild>
            <fieldset className={styles.profileGroup} disabled={model.denied}>
              <legend>{size}</legend>
              <div className={styles.filters}>
                <label className={styles.field}>
                  Ширина, px
                  <UiInput
                    inputMode="numeric"
                    value={variant.width}
                    aria-invalid={Boolean(errors.width)}
                    aria-describedby={
                      errors.width ? `${id}-${size}-width` : undefined
                    }
                    onChange={(event) =>
                      model.editProfile(size, "width", event.target.value)
                    }
                  />
                  {errors.width && (
                    <span className={styles.error} id={`${id}-${size}-width`}>
                      {errors.width}
                    </span>
                  )}
                </label>
                <label className={styles.field}>
                  Качество, 1–100
                  <UiInput
                    inputMode="numeric"
                    value={variant.quality}
                    aria-invalid={Boolean(errors.quality)}
                    aria-describedby={
                      errors.quality ? `${id}-${size}-quality` : undefined
                    }
                    onChange={(event) =>
                      model.editProfile(size, "quality", event.target.value)
                    }
                  />
                  {errors.quality && (
                    <span className={styles.error} id={`${id}-${size}-quality`}>
                      {errors.quality}
                    </span>
                  )}
                </label>
                <label className={styles.field}>
                  Формат
                  <UiSelect
                    value={variant.format}
                    onChange={(event) =>
                      model.editProfile(size, "format", event.target.value)
                    }
                  >
                    {["WebP", "AVIF", "JPEG"].map((format) => (
                      <option key={format}>{format}</option>
                    ))}
                  </UiSelect>
                </label>
              </div>
            </fieldset>
          </UiSurface>
        );
      })}
      <UiButton
        variant="secondary"
        disabled={model.denied}
        onClick={model.resetProfile}
      >
        Сбросить пример
      </UiButton>
      <UiSurface className={`${styles.stack} ${styles.insetPanel}`}>
        <h3>Применённая сводка примера</h3>
        {Object.entries(model.appliedProfiles[model.profile]).map(
          ([size, variant]) => (
            <p key={size}>
              {size}: {variant.width} px · качество {variant.quality} ·{" "}
              {variant.format}
            </p>
          ),
        )}
      </UiSurface>
    </section>
  );
}
