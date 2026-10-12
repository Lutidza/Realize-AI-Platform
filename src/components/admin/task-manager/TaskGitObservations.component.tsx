/**
 * @file src/components/admin/task-manager/TaskGitObservations.component.tsx
 * @version 1.1.0
 * @date 2026-10-12
 * @description Показывает live сведения, immutable Git-снимки и CI с явной принадлежностью ревизии задачи.
 * @see documentation/specifications/task-management-execution.md
 */
import { UiBadge, UiButton, UiSurface } from "@realize/ui-kit";
import { useState } from "react";
import type { TaskGitObservationsProps } from "./TaskGitObservations.types";
import { useTaskGitObservations } from "./useTaskGitObservations.hook";
import { useTaskGitSyncs } from "./useTaskGitSyncs.hook";
import { TaskGitCi } from "./TaskGitCi.component";
import { taskGitUnavailableLabels } from "./taskManager.constants";
import styles from "./TaskManagerWorkbench.module.css";

/** Сохранённые facts и live preview не меняют task status или verification ручной привязки. */
export function TaskGitObservations({
  task,
  participants,
}: TaskGitObservationsProps) {
  const observation = useTaskGitObservations(task);
  const sync = useTaskGitSyncs(task);
  const [view, setView] = useState<"saved" | "live">("saved");
  const data = view === "live" ? observation.data : sync.selected;
  return (
    <section className={styles.stack} aria-label="Сведения Git">
      <div className={styles.sectionHeading}>
        <h3>Сведения GitHub</h3>
        <UiButton
          variant="secondary"
          size="small"
          disabled={
            observation.loading || sync.saving || !task.gitBindings.length
          }
          onClick={() => {
            setView("live");
            void observation.refresh();
          }}
        >
          {observation.loading
            ? "Проверка Git…"
            : observation.data
              ? "Обновить сведения Git"
              : "Проверить Git"}
        </UiButton>
        <UiButton
          size="small"
          disabled={
            sync.saving ||
            observation.loading ||
            (!task.gitBindings.length && !sync.retry)
          }
          onClick={() => {
            setView("saved");
            void sync.sync();
          }}
        >
          {sync.saving
            ? "Синхронизация Git…"
            : sync.retry
              ? "Повторить синхронизацию"
              : "Синхронизировать Git"}
        </UiButton>
      </div>
      <p className={styles.muted}>
        Синхронизация сохраняет снимок Git и CI. Проверка Git запрашивает
        текущие сведения. Статус задачи и ручные привязки сохраняются.
      </p>
      <div aria-live="polite" aria-busy={sync.loading || sync.saving}>
        {sync.loading && <p>Загрузка сохранённых снимков…</p>}
        {sync.saving && <p>Получаем и сохраняем сведения GitHub…</p>}
        {sync.syncError && (
          <p role="alert" className={styles.error}>
            {sync.syncError}
          </p>
        )}
        {sync.historyError && (
          <p role="alert" className={styles.error}>
            {sync.historyError}
          </p>
        )}
        {sync.historyError && (
          <UiButton
            variant="secondary"
            size="small"
            onClick={() => void sync.load()}
          >
            Повторить загрузку истории Git
          </UiButton>
        )}
      </div>
      {sync.items.length > 0 && (
        <details>
          <summary>Сохранённые снимки Git ({sync.items.length})</summary>
          <ol>
            {sync.items.map((item) => (
              <li key={item.id}>
                <UiButton
                  variant="secondary"
                  size="small"
                  aria-pressed={
                    view === "saved" && sync.selected?.id === item.id
                  }
                  onClick={() => {
                    sync.select(item.id);
                    setView("saved");
                  }}
                >
                  Ревизия {item.taskRevision} ·{" "}
                  {new Date(item.recordedAt).toLocaleString("ru-RU")}
                </UiButton>
              </li>
            ))}
          </ol>
          {sync.nextCursor && (
            <UiButton
              variant="secondary"
              size="small"
              disabled={sync.loading}
              onClick={() => void sync.load(sync.nextCursor)}
            >
              Загрузить более ранние снимки
            </UiButton>
          )}
        </details>
      )}
      {view === "saved" && !data && sync.items.length > 0 && (
        <p>
          Снимка для текущей ревизии {task.revision} ещё нет. Предыдущие снимки
          доступны в истории Git.
        </p>
      )}
      <div aria-live="polite" aria-busy={observation.loading}>
        {observation.loading && <p>Получаем сведения GitHub…</p>}
        {observation.error && (
          <p role="alert" className={styles.error}>
            {observation.error}
          </p>
        )}
      </div>
      {data && (
        <>
          {view === "saved" && sync.selected && (
            <p>
              Сохранённый снимок · ревизия {sync.selected.taskRevision} · автор{" "}
              {participants.find((actor) => actor.id === sync.selected?.actorId)
                ?.name ?? sync.selected.actorId}
            </p>
          )}
          {data.taskRevision !== task.revision && (
            <p role="status">
              Исторический снимок: ревизия {data.taskRevision}. Текущая ревизия
              задачи — {task.revision}; эти факты не подтверждают её результат.
            </p>
          )}
          <p className={styles.muted}>
            Проверено:{" "}
            <time dateTime={data.observedAt}>
              {new Date(data.observedAt).toLocaleString("ru-RU")}
            </time>
          </p>
          {!data.complete && (
            <p>
              Показаны первые {data.items.length} привязок ревизии{" "}
              {data.taskRevision}. Проверка остальных пока не поддерживается.
            </p>
          )}
          {data.items.map((item, index) => (
            <UiSurface key={index} tone="raised" className={styles.binding}>
              <strong>{item.binding.repositoryId}</strong>
              {item.status === "unavailable" ? (
                <div className={styles.stack}>
                  <code className={styles.sha}>{item.binding.commitSha}</code>
                  <p>{taskGitUnavailableLabels[item.reason]}</p>
                </div>
              ) : (
                <div className={styles.stack}>
                  <UiBadge>Коммит найден на GitHub</UiBadge>
                  <a
                    href={item.commit.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.sha}
                  >
                    Открыть коммит {item.commit.sha}
                  </a>
                  <a
                    href={item.repository.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Репозиторий {item.repository.fullName}
                  </a>
                  {item.pullRequests.length ? (
                    <ul>
                      {item.pullRequests.map((pr) => (
                        <li key={pr.number}>
                          <a
                            href={pr.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            PR #{pr.number}
                          </a>{" "}
                          ·{" "}
                          {pr.merged
                            ? "Объединён"
                            : pr.state === "open"
                              ? "Открыт"
                              : "Закрыт"}
                          {pr.draft && " · Черновик"}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>GitHub не вернул связанных PR.</p>
                  )}
                  {!item.pullRequestsComplete && (
                    <p>Показана первая страница связанных PR.</p>
                  )}
                  <TaskGitCi ci={item.ci} />
                </div>
              )}
            </UiSurface>
          ))}
        </>
      )}
    </section>
  );
}
