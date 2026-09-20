/**
 * @file packages/ui-kit/src/entity-mark/UiEntityMark.component.tsx
 * @version 1.0.0
 * @date 2026-09-18
 * @description Отображает декоративный знак рядом с названием, используя общую палитру бейджей.
 * @see documentation/architecture/ui-kit.md
 */
"use client";
import { UiBadge } from "../badge/UiBadge.component";
import { useUiEntityMark } from "./useUiEntityMark.hook";
import type { UiEntityMarkProps } from "./UiEntityMark.types";
import styles from "./UiEntityMark.module.css";

export function UiEntityMark({
  label,
  icon,
  imageSrc,
  accent = "purple",
  size = "small",
}: UiEntityMarkProps) {
  const { showImage, onError } = useUiEntityMark(imageSrc);
  return (
    <UiBadge
      className={styles.mark}
      accent={accent}
      data-size={size}
      title={label}
      aria-hidden="true"
    >
      {showImage ? (
        // Framework-neutral primitive поддерживает локальные data/blob images без Next loader.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageSrc} alt="" onError={onError} className={styles.image} />
      ) : (
        icon
      )}
    </UiBadge>
  );
}
