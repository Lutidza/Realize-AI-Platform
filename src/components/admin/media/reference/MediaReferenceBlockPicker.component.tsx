/**
 * @file src/components/admin/media/reference/MediaReferenceBlockPicker.component.tsx
 * @version 1.0.0
 * @date 2026-09-14
 * @description Пример блока и тематический диалог выбора изображения.
 * @see documentation/specifications/media-management-references.md
 */

import * as Dialog from "@radix-ui/react-dialog";
import {
  UiButton,
  UiInput,
  UiNotice,
  UiSurface,
  UiTheme,
  UiTextarea,
} from "@realize/ui-kit";
import { X } from "lucide-react";
import type { ScreenProps } from "./MediaReference.types";
import { MediaReferenceAssetCard } from "./MediaReferenceAssetCard.component";
import { MediaReferenceLibrary } from "./MediaReferenceLibrary.component";
import styles from "./MediaReferenceWorkbench.module.css";

export function MediaReferenceBlockPicker({ model }: ScreenProps) {
  const canConfirm =
    !model.denied &&
    model.pending?.kind === "image" &&
    model.scenario === "normal";
  return (
    <section className={styles.stack}>
      <h2>Использование в блоке</h2>
      <UiNotice>
        Пример блока. Выбор и текст сохраняются только в этом сеансе.
      </UiNotice>
      <UiSurface className={`${styles.stack} ${styles.insetPanel}`}>
        <h3>Изображение блока</h3>
        {model.block ? (
          <>
            <MediaReferenceAssetCard
              asset={{ ...model.block, alt: model.blockAlt }}
              onPreviewError={model.previewError}
            />
            <p>{model.block.name}</p>
          </>
        ) : (
          <p>Изображение не выбрано</p>
        )}
        <label className={styles.field}>
          Альтернативный текст блока
          <UiInput
            disabled={model.denied}
            value={model.blockAlt}
            onChange={(event) => model.editBlock("alt", event.target.value)}
          />
        </label>
        <label className={styles.field}>
          Подпись блока
          <UiTextarea
            disabled={model.denied}
            value={model.blockCaption}
            onChange={(event) => model.editBlock("caption", event.target.value)}
          />
        </label>
        {model.blockCaption && <p>{model.blockCaption}</p>}
        <div className={styles.actions}>
          <Dialog.Root
            open={model.dialogOpen}
            onOpenChange={model.changeDialog}
          >
            <Dialog.Trigger asChild>
              <UiButton disabled={model.denied}>
                {model.block ? "Заменить изображение" : "Выбрать изображение"}
              </UiButton>
            </Dialog.Trigger>
            <Dialog.Portal>
              {/* Body portal выходит из isolation Payload, тема задаётся явно. */}
              <UiTheme
                mode={model.theme}
                className={`${styles.root} ${styles.portal}`}
              >
                <Dialog.Overlay className={styles.overlay} />
                <Dialog.Content
                  className={styles.dialog}
                  onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    model.focusPickerSearch();
                  }}
                >
                  <div className={styles.dialogHeader}>
                    <div>
                      <Dialog.Title>Выбрать изображение</Dialog.Title>
                      <Dialog.Description>
                        Выберите материал и подтвердите выбор. Другие файлы
                        доступны для просмотра.
                      </Dialog.Description>
                    </div>
                    <Dialog.Close asChild>
                      <UiButton
                        variant="ghost"
                        size="icon"
                        aria-label="Закрыть выбор изображения"
                      >
                        <X aria-hidden="true" size={20} />
                      </UiButton>
                    </Dialog.Close>
                  </div>
                  <div className={styles.dialogBody}>
                    <MediaReferenceLibrary
                      model={model}
                      picker
                      attachSearchInput={model.attachSearchInput}
                    />
                  </div>
                  <div className={styles.dialogFooter}>
                    <p aria-live="polite">
                      {model.pending
                        ? `Выбрано: ${model.pending.name}${model.pending.kind === "other" ? " — требуется изображение" : ""}`
                        : "Выберите изображение из библиотеки"}
                    </p>
                    <div className={styles.actions}>
                      <Dialog.Close asChild>
                        <UiButton variant="secondary">Отмена</UiButton>
                      </Dialog.Close>
                      <UiButton
                        disabled={!canConfirm}
                        onClick={model.confirmImage}
                      >
                        Выбрать изображение
                      </UiButton>
                    </div>
                  </div>
                </Dialog.Content>
              </UiTheme>
            </Dialog.Portal>
          </Dialog.Root>
          {model.block && (
            <UiButton
              variant="secondary"
              disabled={model.denied}
              onClick={model.removeBlock}
            >
              Убрать из примера
            </UiButton>
          )}
        </div>
      </UiSurface>
    </section>
  );
}
