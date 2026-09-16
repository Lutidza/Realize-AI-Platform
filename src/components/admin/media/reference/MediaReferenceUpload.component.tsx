/**
 * @file src/components/admin/media/reference/MediaReferenceUpload.component.tsx
 * @version 1.0.0
 * @date 2026-09-14
 * @description Выбор и перетаскивание локальных файлов без отправки.
 * @see documentation/specifications/media-management-references.md
 */

import {
  UiBadge,
  UiButton,
  UiNotice,
  UiSelect,
  UiSurface,
} from "@realize/ui-kit";
import { Upload } from "lucide-react";
import type { ScreenProps } from "./MediaReference.types";
import { purposes } from "./mediaReference.fixtures";
import { MediaReferenceAssetCard } from "./MediaReferenceAssetCard.component";
import styles from "./MediaReferenceWorkbench.module.css";

export function MediaReferenceUpload({ model }: ScreenProps) {
  const { attachUploadInput } = model;
  const files = model.assets.filter((asset) => asset.local);
  return (
    <section className={styles.stack}>
      <h2>Добавление файлов</h2>
      <UiNotice>
        Файлы добавляются только в макет и не отправляются на сервер
      </UiNotice>
      <div
        className={styles.dropzone}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!model.denied)
            model.addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <Upload aria-hidden="true" size={32} />
        <p>Перетащите файлы сюда или выберите на устройстве</p>
        <input
          ref={attachUploadInput}
          className={styles.visuallyHidden}
          type="file"
          multiple
          tabIndex={-1}
          aria-label="Локальные файлы"
          disabled={model.denied}
          onChange={(event) => {
            model.addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <UiButton disabled={model.denied} onClick={model.openFilePicker}>
          Выбрать файлы
        </UiButton>
      </div>
      {files.length === 0 ? (
        <p>Файлы ещё не выбраны</p>
      ) : (
        files.map((asset) => (
          <UiSurface key={asset.id} className={styles.uploadRow}>
            <MediaReferenceAssetCard
              asset={asset}
              onPreviewError={model.previewError}
            />
            <div className={styles.stack}>
              <h3>{asset.name}</h3>
              <p>{asset.size?.toLocaleString("ru")} байт</p>
              <label className={styles.field}>
                Назначение
                <UiSelect
                  disabled={model.denied}
                  value={asset.purpose}
                  onChange={(event) =>
                    model.editAsset(asset.id, {
                      purpose: event.target.value as typeof asset.purpose,
                    })
                  }
                >
                  {purposes.map((purpose) => (
                    <option key={purpose}>{purpose}</option>
                  ))}
                </UiSelect>
              </label>
              <UiBadge tone="positive">Добавлен в макет — не отправлен</UiBadge>
              {asset.previewError && (
                <UiNotice tone="danger">
                  Не удалось показать изображение. Выберите файл повторно
                </UiNotice>
              )}
              <UiButton
                variant="danger"
                disabled={model.denied}
                onClick={() => model.removeFile(asset.id)}
              >
                Удалить из макета
              </UiButton>
            </div>
          </UiSurface>
        ))
      )}
      <UiButton variant="secondary" onClick={() => model.setSection("library")}>
        К библиотеке
      </UiButton>
    </section>
  );
}
