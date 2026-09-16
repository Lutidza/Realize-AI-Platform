/**
 * @file src/components/admin/media/MediaProcessingField.component.tsx
 * @version 1.0.0
 * @date 2026-09-15
 * @description Показывает приватный исходник и настоящие наборы обработки в штатной карточке Media.
 * @see documentation/specifications/media-management.md
 */
"use client";

import {
  useConfig,
  useDocumentInfo,
  useField,
  useFormModified,
  useTheme,
} from "@payloadcms/ui";
import {
  UiBadge,
  UiButton,
  UiNotice,
  UiSurface,
  UiTheme,
} from "@realize/ui-kit";
import { Download, RefreshCw } from "lucide-react";
import { formatAdminURL, formatFilesize } from "payload/shared";
import { useId } from "react";
import { useMediaProcessing } from "./useMediaProcessing.hook";
import styles from "./MediaProcessingField.module.css";

const statusLabels = {
  queued: "В очереди",
  processing: "Обрабатывается",
  ready: "Готово",
  failed: "Ошибка",
} as const;

function MediaProcessingPanel({
  endpoint,
  canQueue,
}: {
  endpoint: string;
  canQueue: boolean;
}) {
  const headingID = useId();
  const model = useMediaProcessing(endpoint);
  return (
    <section className={styles.root} aria-labelledby={headingID}>
      <div className={styles.heading}>
        <div>
          <h3 id={headingID}>Обработка изображения</h3>
          <p className={styles.muted}>
            Каждый набор сохраняет выбранную версию профиля. Готовые файлы
            остаются неизменными.
          </p>
        </div>
        <UiButton
          type="button"
          variant="ghost"
          size="small"
          disabled={model.isLoading || model.isMutating}
          onClick={model.refresh}
        >
          <RefreshCw aria-hidden size={16} />
          Обновить
        </UiButton>
      </div>

      {model.data?.original && (
        <UiSurface className={styles.original}>
          <div>
            <strong>Исходный файл</strong>
            <p className={styles.muted}>{model.data.original.filename}</p>
            {model.data.original.provenance === "legacy-copy" && (
              <p className={styles.muted}>
                Копия ранее сохранённого файла. Первоначальные байты загрузки
                неизвестны.
              </p>
            )}
          </div>
          <a
            className={styles.link}
            href={model.data.original.url}
            download={model.data.original.filename}
          >
            <Download aria-hidden size={16} />
            Скачать исходник
          </a>
        </UiSurface>
      )}

      <div className={styles.actions}>
        <UiButton
          type="button"
          disabled={!canQueue || model.isMutating || model.isLoading}
          onClick={() => void model.queue()}
        >
          {model.isMutating
            ? "Отправка запроса…"
            : "Создать варианты по текущему профилю"}
        </UiButton>
        <p className={styles.muted}>
          {canQueue
            ? "Будет использован сохранённый профиль. Изображения на страницах автоматически не заменяются."
            : "Сначала сохраните файл и выбранный профиль обработки."}
        </p>
      </div>

      {model.error && (
        <UiNotice tone="danger" role="alert">
          {model.error}
        </UiNotice>
      )}
      {model.isLoading && (
        <p className={styles.muted} role="status">
          Загрузка обработки…
        </p>
      )}
      {model.data && model.data.sets.length === 0 && !model.isLoading && (
        <UiNotice>
          Наборов обработки пока нет. Выберите и сохраните профиль обработки.
        </UiNotice>
      )}

      <div className={styles.sets}>
        {model.data?.sets.map((set) => (
          <UiSurface className={styles.set} key={set.id}>
            <div className={styles.setHeading}>
              <div>
                <h4>{set.profileName}</h4>
                <p className={styles.muted}>
                  Версия {set.profileVersion} ·{" "}
                  <time dateTime={set.createdAt}>
                    {set.createdAt.slice(0, 10).split("-").reverse().join(".")}
                  </time>
                </p>
              </div>
              <UiBadge
                dot
                tone={
                  set.status === "ready"
                    ? "positive"
                    : set.status === "failed"
                      ? "danger"
                      : "neutral"
                }
              >
                {statusLabels[set.status]}
              </UiBadge>
            </div>
            {(set.status === "queued" || set.status === "processing") && (
              <p className={styles.muted} role="status">
                Статус обновляется автоматически. Можно продолжить работу.
              </p>
            )}
            {set.error && <UiNotice tone="danger">{set.error}</UiNotice>}
            {set.canRetry && (
              <UiButton
                type="button"
                variant="secondary"
                size="small"
                disabled={model.isMutating}
                onClick={() => void model.retry(set.id)}
              >
                Повторить обработку
              </UiButton>
            )}
            {set.status === "ready" && (
              <div className={styles.variants}>
                {set.variants.map((variant) => (
                  <figure className={styles.variant} key={variant.id}>
                    <a
                      className={styles.imageLink}
                      href={variant.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Открыть ${variant.slot}, ${variant.format.toUpperCase()}`}
                    >
                      {/* Готовый вариант выдаётся без повторного кодирования Next Image. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={variant.url}
                        alt={`${variant.slot}, ${variant.format.toUpperCase()}`}
                        width={variant.width}
                        height={variant.height}
                        loading="lazy"
                      />
                    </a>
                    <figcaption>
                      <strong>
                        {variant.slot} · {variant.format.toUpperCase()}
                      </strong>
                      <span className={styles.muted}>
                        {variant.width} × {variant.height} px ·{" "}
                        {formatFilesize(variant.filesize)}
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </UiSurface>
        ))}
      </div>

      {(model.page > 1 || model.data?.hasMore) && (
        <nav
          className={styles.pagination}
          aria-label="Страницы наборов обработки"
        >
          <UiButton
            type="button"
            variant="secondary"
            size="small"
            disabled={model.page === 1 || model.isLoading || model.isMutating}
            onClick={() => model.changePage(model.page - 1)}
          >
            Назад
          </UiButton>
          <span>Страница {model.page}</span>
          <UiButton
            type="button"
            variant="secondary"
            size="small"
            disabled={
              !model.data?.hasMore || model.isLoading || model.isMutating
            }
            onClick={() => model.changePage(model.page + 1)}
          >
            Далее
          </UiButton>
        </nav>
      )}
    </section>
  );
}

/** Новая native форма сначала сохраняет Media; поле UI само ничего в форму не записывает. */
export function MediaProcessingField() {
  const { id, data: savedData } = useDocumentInfo();
  const { config } = useConfig();
  const { theme } = useTheme();
  const modified = useFormModified();
  const { value: processingProfile } = useField({ path: "processingProfile" });
  const savedRevision =
    typeof savedData?.updatedAt === "string" ? savedData.updatedAt : "";
  const endpoint =
    id === undefined || id === null
      ? undefined
      : formatAdminURL({
          apiRoute: config.routes.api,
          serverURL: config.serverURL,
          path: `/media/${encodeURIComponent(String(id))}/processing`,
        });
  return (
    <UiTheme mode={theme}>
      {endpoint ? (
        <MediaProcessingPanel
          key={`${endpoint}:${savedRevision}`}
          endpoint={endpoint}
          canQueue={!modified && Boolean(processingProfile)}
        />
      ) : (
        <UiNotice>
          Сохраните файл, чтобы увидеть исходник и наборы обработки.
        </UiNotice>
      )}
    </UiTheme>
  );
}
