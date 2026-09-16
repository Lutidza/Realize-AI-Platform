/**
 * @file src/components/admin/media/reference/MediaReferenceLibrary.component.tsx
 * @version 1.0.0
 * @date 2026-09-14
 * @description Общая библиотека просмотра и выбора с фильтрами и страницами.
 * @see documentation/specifications/media-management-references.md
 */

import { UiButton, UiInput, UiNotice, UiSelect } from "@realize/ui-kit";
import { Plus } from "lucide-react";
import { useId } from "react";
import type { LibraryProps } from "./MediaReference.types";
import { defaultLibrary, folders, purposes } from "./mediaReference.fixtures";
import { MediaReferenceAssetCard } from "./MediaReferenceAssetCard.component";
import styles from "./MediaReferenceWorkbench.module.css";

/** Два экземпляра используют отдельные контексты, сохраняемые корневым hook. */
export function MediaReferenceLibrary({
  model,
  picker = false,
  attachSearchInput,
}: LibraryProps) {
  const id = useId();
  const context = picker ? model.pickerLibrary : model.library;
  const result = model.libraryResults(picker);
  const update = (patch: Parameters<typeof model.changeLibrary>[1]) =>
    model.changeLibrary(picker, patch);
  return (
    <section
      className={styles.stack}
      aria-label={picker ? "Выбор из библиотеки" : "Библиотека материалов"}
      aria-busy={model.scenario === "loading"}
    >
      {!picker && (
        <div className={styles.toolbar}>
          <h2>Библиотека</h2>
          <UiButton
            disabled={model.denied}
            onClick={() => model.setSection("upload")}
          >
            <Plus aria-hidden="true" size={18} />
            Добавить файлы
          </UiButton>
        </div>
      )}
      <label className={styles.field} htmlFor={`${id}-search`}>
        Поиск по названию
        <UiInput
          ref={attachSearchInput}
          id={`${id}-search`}
          type="search"
          value={context.search}
          onChange={(event) => update({ search: event.target.value })}
        />
      </label>
      <div className={styles.filters}>
        <label className={styles.field}>
          Тип
          <UiSelect
            value={context.kind}
            onChange={(event) => update({ kind: event.target.value })}
          >
            <option value="">Все типы</option>
            <option value="image">Изображения</option>
            <option value="other">Другие файлы</option>
          </UiSelect>
        </label>
        <label className={styles.field}>
          Назначение
          <UiSelect
            value={context.purpose}
            onChange={(event) => update({ purpose: event.target.value })}
          >
            <option value="">Все назначения</option>
            {purposes.map((purpose) => (
              <option key={purpose}>{purpose}</option>
            ))}
          </UiSelect>
        </label>
        <label className={styles.field}>
          Сортировка
          <UiSelect
            value={context.sort}
            onChange={(event) => update({ sort: event.target.value })}
          >
            <option value="new">Сначала новые</option>
            <option value="name">Название: А–Я</option>
          </UiSelect>
        </label>
        <label className={styles.field}>
          Папки — пример
          <UiSelect
            value={context.folder}
            onChange={(event) => update({ folder: event.target.value })}
          >
            {folders.map((folder) => (
              <option key={folder}>{folder}</option>
            ))}
          </UiSelect>
        </label>
      </div>
      <div className={styles.toolbar}>
        <div
          className={styles.actions}
          role="group"
          aria-label="Вид материалов"
        >
          <UiButton
            variant="secondary"
            aria-pressed={context.view === "grid"}
            onClick={() => update({ view: "grid" })}
          >
            Сетка
          </UiButton>
          <UiButton
            variant="secondary"
            aria-pressed={context.view === "list"}
            onClick={() => update({ view: "list" })}
          >
            Список
          </UiButton>
        </div>
        <UiButton
          variant="ghost"
          onClick={() =>
            update({
              ...defaultLibrary,
              view: context.view,
              sort: context.sort,
            })
          }
        >
          Сбросить фильтры
        </UiButton>
      </div>
      {model.scenario === "loading" ? (
        <div className={styles.stack}>
          <p role="status">Пример загрузки библиотеки</p>
          <div className={styles.grid} aria-hidden="true">
            {[1, 2, 3, 4].map((key) => (
              <div className={styles.skeleton} key={key} />
            ))}
          </div>
        </div>
      ) : model.scenario === "error" ? (
        <UiNotice tone="danger">
          <p>Пример ошибки: библиотека недоступна</p>
          <UiButton onClick={() => model.setScenario("normal")}>
            Повторить в примере
          </UiButton>
        </UiNotice>
      ) : model.scenario === "empty" ? (
        <UiNotice>
          <p>Пока нет материалов</p>
          <UiButton
            onClick={() => {
              if (picker) model.changeDialog(false);
              model.setSection("upload");
            }}
          >
            Добавить файлы
          </UiButton>
        </UiNotice>
      ) : (
        <>
          <p role="status">Найдено материалов: {result.total}</p>
          {result.total === 0 ? (
            <UiNotice>
              Ничего не найдено. Измените запрос или сбросьте фильтры
            </UiNotice>
          ) : (
            <div
              className={context.view === "grid" ? styles.grid : styles.list}
            >
              {result.items.map((asset) => (
                <MediaReferenceAssetCard
                  key={asset.id}
                  asset={asset}
                  onPreviewError={model.previewError}
                  selected={
                    asset.id ===
                    (picker ? model.pending?.id : model.details?.id)
                  }
                  disabled={picker && model.denied}
                  onSelect={(element) =>
                    model.selectAsset(asset.id, picker, element)
                  }
                />
              ))}
            </div>
          )}
          <nav className={styles.toolbar} aria-label="Страницы материалов">
            <UiButton
              variant="secondary"
              disabled={result.page <= 1}
              onClick={() => update({ page: result.page - 1 })}
            >
              Назад
            </UiButton>
            <span>
              Страница {result.page} из {result.pages}
            </span>
            <UiButton
              variant="secondary"
              disabled={result.page >= result.pages}
              onClick={() => update({ page: result.page + 1 })}
            >
              Далее
            </UiButton>
          </nav>
        </>
      )}
    </section>
  );
}
