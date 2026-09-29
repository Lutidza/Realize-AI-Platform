/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/SearchObservationDetails.component.tsx
 * @version 1.0.1
 * @date 2026-09-27
 * @description Показывает измерения и фактически использованные ограничения одного запроса.
 */
import type { SearchObservationDetailsProps } from "./SearchObservations.types";
import {
  searchOutcomeLabels,
  searchReasonLabels,
} from "./searchObservationPresentation.config";
import styles from "./SearchObservations.module.css";
export function SearchObservationDetails({
  item,
}: SearchObservationDetailsProps) {
  const event = item.event;
  return (
    <details className={styles.record}>
      <summary>
        <span>{new Date(event.observedAt).toLocaleString("ru-RU")}</span>
        <span>
          {event.source.toUpperCase()} ·{" "}
          {item.origin === "runtime" ? "Runtime" : "Локальные замеры"}
        </span>
        <span>{searchOutcomeLabels[event.outcome]}</span>
        <span>
          {Math.round(event.durationMs)} мс · Результатов: {event.returnedCount}
        </span>
      </summary>
      <dl className={styles.metrics}>
        <div>
          <dt>Идентификатор запроса</dt>
          <dd>{event.eventID}</dd>
        </div>
        <div>
          <dt>Причина ограничения</dt>
          <dd>{event.reason ? searchReasonLabels[event.reason] : "Нет"}</dd>
        </div>
        <div>
          <dt>Профиль / операция</dt>
          <dd>
            {event.profile ?? "Не измерено"} / {event.operation}
          </dd>
        </div>
        <div>
          <dt>Первое совпадение</dt>
          <dd>
            {event.firstMatchMs === null
              ? "Не найдено / не измерено"
              : `${Math.round(event.firstMatchMs)} мс`}
          </dd>
        </div>
        <div>
          <dt>Выбранные кандидаты</dt>
          <dd>{event.candidateFiles ?? "Не измерено"}</dd>
        </div>
        <div>
          <dt>Успешно прочитано файлов</dt>
          <dd>{event.filesRead ?? "Не измерено"}</dd>
        </div>
        <div>
          <dt>Проверенное содержимое, байт</dt>
          <dd>{event.bytesRead ?? "Не измерено"}</dd>
        </div>
        <div>
          <dt>Отклонено при чтении</dt>
          <dd>{event.excludedFiles ?? "Не измерено"}</dd>
        </div>
        <div>
          <dt>Ответ, байт UTF-8</dt>
          <dd>
            {event.outputBytes} ·{" "}
            {event.outputUnit === "cli_records_utf8"
              ? "строки результатов"
              : "результат MCP в JSON"}
          </dd>
        </div>
        <div>
          <dt>Тип запроса / регистр</dt>
          <dd>
            {event.queryKind} /{" "}
            {event.caseSensitive ? "учитывается" : "без учёта"}
          </dd>
        </div>
        <div>
          <dt>Область сужена</dt>
          <dd>{event.narrowed ? "Да" : "Нет"}</dd>
        </div>
        <div>
          <dt>Продолжение</dt>
          <dd>
            {event.continuationRequested
              ? "Запрошена следующая страница. "
              : "Начальный запрос. "}
            {event.continuationOffered
              ? "Есть следующая страница."
              : "Продолжение не выдано."}
          </dd>
        </div>
        <div>
          <dt>Лимит результатов / ответа</dt>
          <dd>
            {event.limits.results} / {event.limits.responseBytes} байт
          </dd>
        </div>
        <div>
          <dt>Лимит времени / сканирования</dt>
          <dd>
            {event.limits.timeoutMs} мс /{" "}
            {event.limits.scanBytes === null
              ? "Не задан"
              : `${event.limits.scanBytes} байт`}
          </dd>
        </div>
        <div>
          <dt>Единица колонок, от 1</dt>
          <dd>
            {event.coordinates === "none"
              ? "Без координат"
              : event.coordinates === "utf8_bytes_1based"
                ? "Байты UTF-8"
                : "Unicode code points"}
          </dd>
        </div>
        <div>
          <dt>Токены модели</dt>
          <dd>Не измеряются поисковым инструментом</dd>
        </div>
      </dl>
      {item.origin === "import" ? (
        <p>
          Показатели получены от локального CLI; сервер не подтверждает
          выполнение этого поиска.
        </p>
      ) : null}
      {event.continuationRequested ? (
        <p>
          MCP повторно проверяет содержимое для snapshot. Прочитанные байты
          относятся к этой странице.
        </p>
      ) : null}
    </details>
  );
}
