/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/WorkshopPreview.component.tsx
 * @version 1.0.0
 * @date 2026-09-26
 * @description Управляет capture сохранённого React-макета и сравнением трёх размеров экрана.
 * @see documentation/specifications/design-workshop.md
 */
"use client";
import { useState } from "react";
import { Monitor, Play, RefreshCw, Smartphone, Tablet, X } from "lucide-react";
import { DESIGN_PREVIEW } from "@realize/ai-contracts";
import { UiBadge, UiButton, UiNotice, UiSelect } from "@realize/ui-kit";
import type { WorkshopPreviewProps } from "./WorkshopPreview.types";
import { useWorkshopPreview } from "./useWorkshopPreview.hook";
import {
  WORKSHOP_PREVIEW_ERRORS,
  WORKSHOP_PREVIEW_STATUS,
} from "./workshopPreview.constants";
import { WorkshopPreviewImage } from "./WorkshopPreviewImage.component";
import common from "./Workshop.module.css";
import styles from "./WorkshopPreview.module.css";

export function WorkshopPreview({
  projectId,
  revision,
  dirty,
  enabled,
}: WorkshopPreviewProps) {
  const preview = useWorkshopPreview(projectId, revision.revisionId, enabled);
  const [chosenEntry, chooseEntry] = useState("");
  const [width, setWidth] = useState<number>(1440);
  const entries = revision.snapshot.files.filter((file) =>
    /^src\/.+\.(tsx|jsx|ts|js)$/.test(file.path),
  );
  const entry =
    entries.find((file) => file.path === chosenEntry)?.path ??
    entries[0]?.path ??
    "";
  const job = preview.selected;
  const running = job?.state === "queued" || job?.state === "running";
  return (
    <section
      className={common.section}
      aria-label="Предпросмотр макета"
      aria-busy={preview.busy}
    >
      <div className={common.sectionHeading}>
        <div>
          <h2>Предпросмотр макета</h2>
          <p>
            Снимки сохранённой версии на телефоне, планшете и широком экране.
          </p>
        </div>
        <UiButton
          variant="secondary"
          size="small"
          aria-label="Обновить preview"
          onClick={preview.reload}
        >
          <RefreshCw size={16} />
        </UiButton>
      </div>
      <div className={styles.toolbar}>
        <label className={common.field}>
          <span>Главный React-компонент · версия {revision.number}</span>
          <UiSelect
            value={entry}
            disabled={!entries.length || preview.busy}
            onChange={(event) => chooseEntry(event.target.value)}
            aria-label="Главный React-компонент"
          >
            {!entries.length && (
              <option value="">Нет сохранённых React-файлов</option>
            )}
            {entries.map((file) => (
              <option key={file.path} value={file.path}>
                {file.path}
              </option>
            ))}
          </UiSelect>
        </label>
        <UiButton
          disabled={
            dirty || !entry || preview.active || preview.busy || preview.loading
          }
          onClick={() => void preview.start(entry)}
        >
          <Play size={16} />
          {preview.busy ? "Отправка…" : "Создать preview"}
        </UiButton>
      </div>
      {dirty ? (
        <UiNotice>
          Сначала сохраните изменения: preview создаётся для сохранённой версии.
        </UiNotice>
      ) : !entries.length ? (
        <p className={common.inlineEmpty}>
          Добавьте во вкладке «Файлы» React-компонент с default export и
          сохраните версию.
        </p>
      ) : (
        <p className={common.caption}>
          Выберите файл с default export React-компонента. Поддерживаются
          локальные импорты, CSS и CSS Modules. Снимки хранятся 24 часа.
        </p>
      )}
      {preview.error && (
        <UiNotice tone="danger" role="alert">
          {preview.error}
        </UiNotice>
      )}
      {preview.loading && <p role="status">Загрузка заданий preview…</p>}
      {preview.items.length > 0 && (
        <label className={common.field}>
          <span>Последние предпросмотры</span>
          <UiSelect
            value={job?.jobId ?? ""}
            onChange={(event) => preview.select(event.target.value)}
            aria-label="Задание preview"
          >
            {preview.items.map((item) => (
              <option key={item.jobId} value={item.jobId}>
                Версия {item.source.revision.number} ·{" "}
                {WORKSHOP_PREVIEW_STATUS[item.state]} ·{" "}
                {new Date(item.createdAt).toLocaleString("ru")}
              </option>
            ))}
          </UiSelect>
        </label>
      )}
      {job ? (
        <>
          <div className={styles.statusRow}>
            <p role="status">
              <UiBadge accent={job.state === "completed" ? "green" : "purple"}>
                {WORKSHOP_PREVIEW_STATUS[job.state]}
              </UiBadge>{" "}
              Версия {job.source.revision.number}
              {job.source.revision.revisionId !== revision.revisionId &&
                " · другая сохранённая версия"}
            </p>
            {running && (
              <UiButton
                size="small"
                variant="secondary"
                disabled={preview.busy}
                onClick={() => void preview.cancel(job.jobId)}
              >
                <X size={14} />
                Отменить preview
              </UiButton>
            )}
          </div>
          {job.error && (
            <UiNotice tone="danger" role="alert">
              {WORKSHOP_PREVIEW_ERRORS[job.error]}
            </UiNotice>
          )}
          {running && (
            <p className={common.caption}>
              Можно закрыть страницу: задание продолжится на сервере. Результат
              появится здесь после завершения.
            </p>
          )}
          {job.state === "completed" && (
            <>
              <div
                className={styles.viewports}
                role="group"
                aria-label="Размер экрана preview"
              >
                {DESIGN_PREVIEW.widths.map((size) => (
                  <UiButton
                    key={size}
                    variant={width === size ? "primary" : "secondary"}
                    size="small"
                    aria-pressed={width === size}
                    onClick={() => setWidth(size)}
                  >
                    {size === 390 ? (
                      <Smartphone size={15} />
                    ) : size === 768 ? (
                      <Tablet size={15} />
                    ) : (
                      <Monitor size={15} />
                    )}
                    {size} px
                  </UiButton>
                ))}
              </div>
              <WorkshopPreviewImage
                key={`${job.jobId}:${width}:${preview.imageVersion}`}
                job={job}
                width={width}
              />
            </>
          )}
          {job.state === "expired" && (
            <p className={common.caption}>
              Снимки удалены по сроку хранения. Для новой проверки запустите
              preview ещё раз.
            </p>
          )}
        </>
      ) : (
        !preview.loading &&
        !preview.error && (
          <p className={common.inlineEmpty}>
            Предпросмотров пока нет. Сохраните макет и создайте первый.
          </p>
        )
      )}
    </section>
  );
}
