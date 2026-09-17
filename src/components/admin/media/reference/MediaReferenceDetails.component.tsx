/**
 * @file src/components/admin/media/reference/MediaReferenceDetails.component.tsx
 * @version 1.0.0
 * @date 2026-09-14
 * @description Контекстные сведения, параметры вариантов и примеры использования.
 * @see documentation/specifications/media-management-references.md
 */

import {
  UiButton,
  UiInput,
  UiSelect,
  UiTabs,
  UiTextarea,
  UiNotice,
} from "@realize/ui-kit";
import type { ScreenProps } from "./MediaReference.types";
import { purposes } from "./mediaReference.fixtures";
import { MediaReferenceAssetCard } from "./MediaReferenceAssetCard.component";
import styles from "./MediaReferenceWorkbench.module.css";

export function MediaReferenceDetails({ model }: ScreenProps) {
  const { attachDetailsHeading } = model;
  const asset = model.details;
  if (!asset) return null;
  return (
    <aside className={styles.stack} aria-label="Сведения о материале">
      <UiButton variant="secondary" onClick={model.closeDetails}>
        {model.sequential ? "Назад к библиотеке" : "Закрыть сведения"}
      </UiButton>
      <h2 ref={attachDetailsHeading} tabIndex={-1}>
        {asset.name}
      </h2>
      <MediaReferenceAssetCard
        asset={asset}
        onPreviewError={model.previewError}
      />
      <UiTabs
        label="Сведения о материале"
        value={model.detailsTab}
        onValueChange={model.setDetailsTab}
        items={[
          {
            id: "info",
            label: "Сведения",
            content: (
              <div className={styles.stack}>
                <label className={styles.field}>
                  Альтернативный текст
                  <UiInput
                    value={asset.alt}
                    disabled={model.denied}
                    onChange={(event) =>
                      model.editAsset(asset.id, { alt: event.target.value })
                    }
                  />
                </label>
                <label className={styles.field}>
                  Подпись
                  <UiTextarea
                    value={asset.caption}
                    disabled={model.denied}
                    onChange={(event) =>
                      model.editAsset(asset.id, { caption: event.target.value })
                    }
                  />
                </label>
                <label className={styles.field}>
                  Назначение
                  <UiSelect
                    value={asset.purpose}
                    disabled={model.denied}
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
                <dl className={styles.metadata}>
                  <dt>Тип</dt>
                  <dd>
                    {asset.kind === "image" ? "Изображение" : "Другой файл"}
                  </dd>
                  <dt>Размер файла</dt>
                  <dd>
                    {asset.size === undefined
                      ? "Нет данных"
                      : `${asset.size.toLocaleString("ru")} байт`}
                  </dd>
                  <dt>Размеры изображения</dt>
                  <dd>Нет данных</dd>
                  <dt>{asset.local ? "Добавлен в сеансе" : "Дата примера"}</dt>
                  <dd>{asset.date.slice(0, 10)}</dd>
                </dl>
                {asset.local && (
                  <UiButton
                    variant="danger"
                    disabled={model.denied}
                    onClick={() => model.removeFile(asset.id)}
                  >
                    Удалить из макета
                  </UiButton>
                )}
              </div>
            ),
          },
          {
            id: "variants",
            label: "Варианты",
            content: (
              <div className={styles.stack}>
                <UiNotice>Пример параметров. Варианты не создавались</UiNotice>
                {Object.entries(model.appliedProfiles[asset.purpose]).map(
                  ([size, variant]) => (
                    <p key={size}>
                      {size}: {variant.width} px · {variant.quality}% ·{" "}
                      {variant.format}
                    </p>
                  ),
                )}
              </div>
            ),
          },
          {
            id: "usage",
            label: "Использование",
            content: (
              <div>
                <h3>Примеры связей</h3>
                {asset.local || asset.id === "demo-document" ? (
                  <p>В этом примере связи не указаны</p>
                ) : (
                  <p>Карточка товара — демонстрационная связь</p>
                )}
              </div>
            ),
          },
        ]}
      />
    </aside>
  );
}
