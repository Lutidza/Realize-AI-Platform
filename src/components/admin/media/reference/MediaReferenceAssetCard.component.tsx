/**
 * @file src/components/admin/media/reference/MediaReferenceAssetCard.component.tsx
 * @version 1.0.0
 * @date 2026-09-14
 * @description Общая карточка материала и безопасный предпросмотр.
 * @see documentation/specifications/media-management-references.md
 */

import { UiBadge, UiButton, UiSurface } from "@realize/ui-kit";
import { FileImage, FileText } from "lucide-react";
import type { AssetCardProps } from "./MediaReference.types";
import styles from "./MediaReferenceWorkbench.module.css";

/** Без onSelect отображает только превью; интерактивная карточка — одна кнопка. */
export function MediaReferenceAssetCard({
  asset,
  selected,
  onSelect,
  onPreviewError,
  disabled,
}: AssetCardProps) {
  const preview = (
    <span className={styles.preview}>
      {asset.url && !asset.previewError ? (
        // Object URL принадлежит файловому hook; удалённые URL допускаются только от host.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.url}
          alt={asset.alt}
          onError={() => onPreviewError(asset.id)}
        />
      ) : (
        <span className={styles.placeholder}>
          {asset.kind === "image" ? (
            <FileImage aria-hidden="true" size={32} />
          ) : (
            <FileText aria-hidden="true" size={32} />
          )}
          <span>
            {asset.previewError
              ? "Не удалось показать изображение. Выберите файл повторно"
              : asset.kind === "other"
                ? "Предпросмотр недоступен для этого типа файла"
                : "Нет изображения для предпросмотра"}
          </span>
        </span>
      )}
    </span>
  );
  if (!onSelect) return preview;
  return (
    <UiSurface
      asChild
      interactive
      className={styles.card}
      data-selected={selected || undefined}
    >
      <UiButton
        variant="ghost"
        className={styles.cardButton}
        aria-pressed={Boolean(selected)}
        disabled={disabled}
        onClick={(event) => onSelect(event.currentTarget)}
      >
        {preview}
        <span className={styles.cardText}>
          <strong>{asset.name}</strong>
          <span>{asset.purpose}</span>
          <UiBadge tone={asset.local ? "positive" : "neutral"}>
            {asset.local ? "Локальный файл" : "Пример"}
          </UiBadge>
          {selected && <span>Выбрано</span>}
        </span>
      </UiButton>
    </UiSurface>
  );
}
