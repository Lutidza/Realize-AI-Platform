/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/SearchObservationManagement.component.tsx
 * @version 1.0.0
 * @date 2026-09-28
 * @description Показывает применённую политику, хранение, очистку и фактическое состояние сборщиков.
 */
"use client";
import { useRef } from "react";
import { UiButton, UiInput, UiNotice, UiSurface } from "@realize/ui-kit";
import { SEARCH_OBSERVATION_SETTINGS_LIMITS as limits } from "@realize/ai-contracts";
import type { SearchObservationManagementProps } from "./SearchObservationManagement.types";
import { useSearchObservationManagement } from "./useSearchObservationManagement.hook";
import { SearchObservationCleanupDialog } from "./SearchObservationCleanupDialog.component";
import {
  searchCleanupLabels,
  searchRuntimeLabels,
} from "./searchObservationPresentation.config";
import styles from "./SearchObservations.module.css";

export function SearchObservationManagement({
  apiURL,
  onChange,
}: SearchObservationManagementProps) {
  const management = useSearchObservationManagement(apiURL, onChange);
  const cleanupTrigger = useRef<HTMLButtonElement | null>(null);
  const { data, fields } = management;
  return (
    <section
      aria-label="Управление диагностикой"
      className={styles.managementSection}
    >
      {management.loadError ? (
        <UiNotice tone="danger" role="alert">
          {management.loadError} Актуальное состояние не подтверждено.
          <UiButton variant="ghost" onClick={management.refresh}>
            Повторить загрузку состояния
          </UiButton>
        </UiNotice>
      ) : null}
      {management.error && !management.preview ? (
        <UiNotice tone="danger" role="alert">
          {management.error}
        </UiNotice>
      ) : null}
      {management.message ? (
        <UiNotice tone="positive" role="status">
          {management.message}
        </UiNotice>
      ) : null}
      {!data ? (
        <p role="status">Загружаем настройки и состояние сборщиков…</p>
      ) : (
        <>
          <div className={styles.managementGrid}>
            <UiSurface className={styles.surface}>
              <h2>Хранение и автоочистка</h2>
              <p className={styles.muted}>
                Действует версия {data.revision}: {data.settings.retentionDays}{" "}
                дн., до {data.settings.capacity.toLocaleString("ru-RU")}{" "}
                записей. Обслуживание каждые{" "}
                {data.settings.cleanupIntervalMinutes} мин.
              </p>
              {fields ? (
                <form
                  className={styles.managementSection}
                  onSubmit={(event) => {
                    event.preventDefault();
                    management.save();
                  }}
                >
                  <div className={styles.filters}>
                    <label>
                      Срок хранения, дней
                      <UiInput
                        type="number"
                        required
                        min={limits.retentionDays.min}
                        max={limits.retentionDays.max}
                        step={1}
                        value={fields.retentionDays}
                        disabled={management.pending}
                        onChange={(event) =>
                          management.edit("retentionDays", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Максимум записей
                      <UiInput
                        type="number"
                        required
                        min={limits.capacity.min}
                        max={limits.capacity.max}
                        step={1}
                        value={fields.capacity}
                        disabled={management.pending}
                        onChange={(event) =>
                          management.edit("capacity", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Интервал очистки, минут
                      <UiInput
                        type="number"
                        required
                        min={limits.cleanupIntervalMinutes.min}
                        max={limits.cleanupIntervalMinutes.max}
                        step={1}
                        value={fields.cleanupIntervalMinutes}
                        disabled={management.pending}
                        onChange={(event) =>
                          management.edit(
                            "cleanupIntervalMinutes",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                  </div>
                  <p className={styles.muted}>
                    Допустимо: 1–7 дней, 100–10 000 записей, 1–60 минут.
                    Уменьшение срока или количества сразу удаляет лишние записи.
                    При записи пределы проверяются независимо от интервала.
                  </p>
                  {management.conflict ? (
                    <UiNotice role="alert">
                      Настройки изменены в другой сессии. Отмените текущие
                      правки и проверьте действующие значения.
                    </UiNotice>
                  ) : null}
                  <div className={styles.actions}>
                    <UiButton
                      type="submit"
                      disabled={
                        management.pending ||
                        !management.dirty ||
                        management.conflict
                      }
                    >
                      Сохранить и применить
                    </UiButton>
                    {management.dirty ? (
                      <UiButton
                        type="button"
                        variant="ghost"
                        disabled={management.pending}
                        onClick={management.reset}
                      >
                        Отменить изменения
                      </UiButton>
                    ) : null}
                  </div>
                </form>
              ) : null}
            </UiSurface>
            <UiSurface className={styles.surface}>
              <h2>Хранилище диагностики</h2>
              <dl className={styles.metrics}>
                <div>
                  <dt>Записей в БД</dt>
                  <dd>{data.storage.count.toLocaleString("ru-RU")}</dd>
                </div>
                <div>
                  <dt>Размер с индексами</dt>
                  <dd>
                    {(data.storage.bytes / 1048576).toLocaleString("ru-RU", {
                      maximumFractionDigits: 2,
                    })}{" "}
                    MiB
                  </dd>
                </div>
                <div>
                  <dt>Самая ранняя запись</dt>
                  <dd>
                    {data.storage.oldestAt
                      ? new Date(data.storage.oldestAt).toLocaleString("ru-RU")
                      : "История пуста"}
                  </dd>
                </div>
                <div>
                  <dt>Последняя очистка</dt>
                  <dd>
                    {data.lastCleanup
                      ? `${new Date(data.lastCleanup.at).toLocaleString("ru-RU")} · удалено ${data.lastCleanup.deletedCount}`
                      : "Ещё не выполнялась"}
                  </dd>
                </div>
                <div>
                  <dt>Следующее обслуживание</dt>
                  <dd>
                    {Date.parse(data.nextCleanupAt) <=
                    Date.parse(data.observedAt)
                      ? "Ожидает работающего сборщика"
                      : new Date(data.nextCleanupAt).toLocaleString("ru-RU")}
                  </dd>
                </div>
              </dl>
              <p className={styles.muted}>
                После удаления PostgreSQL переиспользует освобождённое место;
                размер файлов может уменьшиться не сразу.
              </p>
              <div className={styles.actions}>
                <UiButton
                  variant="secondary"
                  disabled={management.pending}
                  onClick={(event) => {
                    cleanupTrigger.current = event.currentTarget;
                    management.prepare("expired");
                  }}
                >
                  Удалить устаревшее
                </UiButton>
                <UiButton
                  variant="danger"
                  disabled={management.pending}
                  onClick={(event) => {
                    cleanupTrigger.current = event.currentTarget;
                    management.prepare("history");
                  }}
                >
                  Очистить историю
                </UiButton>
              </div>
            </UiSurface>
          </div>
          <UiSurface className={styles.surface}>
            <h2>Состояние сборщиков</h2>
            <p className={styles.muted}>
              Данные на {new Date(data.observedAt).toLocaleString("ru-RU")}.
              Проверяются автоматически каждые 10 секунд в видимой вкладке.
            </p>
            {!data.runtimes.length ? (
              <UiNotice>
                Сборщики ещё не подтвердили работу. Состояние доставки
                неизвестно; пустая история сама по себе не означает отсутствие
                поисков.
              </UiNotice>
            ) : (
              <div className={styles.managementGrid}>
                {[...data.runtimes]
                  .sort(
                    (a, b) =>
                      a.source.localeCompare(b.source) ||
                      a.startedAt.localeCompare(b.startedAt),
                  )
                  .map((runtime) => (
                    <section
                      key={runtime.instanceID}
                      className={styles.runtime}
                      aria-label={`Сборщик ${runtime.source}`}
                    >
                      <h3>
                        {runtime.source === "cli"
                          ? "agent-search · CLI"
                          : "Managed MCP"}{" "}
                        — {searchRuntimeLabels[runtime.state]}
                      </h3>
                      <p className={styles.muted}>
                        Запущен{" "}
                        {new Date(runtime.startedAt).toLocaleString("ru-RU")}.
                        Подтверждена версия {runtime.appliedRevision}
                        {runtime.appliedRevision < data.revision
                          ? " · ожидается подтверждение новых настроек"
                          : ""}
                        .
                      </p>
                      <dl className={styles.metrics}>
                        <div>
                          <dt>В очереди</dt>
                          <dd>{runtime.queued}</dd>
                        </div>
                        <div>
                          <dt>Учтённые потери</dt>
                          <dd>{runtime.dropped}</dd>
                        </div>
                        <div>
                          <dt>Последняя доставка</dt>
                          <dd>
                            {runtime.lastDeliveredAt
                              ? new Date(
                                  runtime.lastDeliveredAt,
                                ).toLocaleString("ru-RU")
                              : "События ещё не доставлялись"}
                          </dd>
                        </div>
                        <div>
                          <dt>Последний сигнал</dt>
                          <dd>
                            {new Date(runtime.heartbeatAt).toLocaleString(
                              "ru-RU",
                            )}
                          </dd>
                        </div>
                      </dl>
                      {runtime.errorCode ? (
                        <UiNotice tone="danger">
                          {runtime.errorCode === "buffer_unavailable"
                            ? "Локальный буфер недоступен."
                            : "Доставка в БД недоступна; выполняются повторные попытки."}
                        </UiNotice>
                      ) : null}
                      {runtime.lastFailureAt ? (
                        <p className={styles.muted}>
                          Последний сбой:{" "}
                          {new Date(runtime.lastFailureAt).toLocaleString(
                            "ru-RU",
                          )}
                        </p>
                      ) : null}
                    </section>
                  ))}
              </div>
            )}
            <p className={styles.muted}>
              Потери CLI показывают учтённые отказы и переполнение буфера; отказ
              самой записи в недоступный буфер измерить полностью нельзя. Для
              MCP счётчик относится к текущему запуску процесса.
            </p>
            {data.actions.length ? (
              <details className={styles.record}>
                <summary>Последние операции управления</summary>
                <ol>
                  {data.actions.map((action) => (
                    <li key={action.requestID}>
                      {new Date(action.at).toLocaleString("ru-RU")} ·{" "}
                      {searchCleanupLabels[action.kind]} · удалено{" "}
                      {action.deletedCount} · версия {action.revision}
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </UiSurface>
        </>
      )}
      <SearchObservationCleanupDialog
        preview={management.preview}
        pending={management.pending}
        error={management.error}
        triggerRef={cleanupTrigger}
        onConfirm={management.confirm}
        onClose={management.closePreview}
      />
    </section>
  );
}
