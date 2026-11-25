/**
 * @file src/components/admin/task-manager/TaskDetail.component.tsx
 * @version 1.4.0
 * @date 2026-11-26
 * @description Показывает сохранённую ревизию задачи, ручные Git-привязки и настоящий audit.
 * @see documentation/specifications/task-management-execution.md
 */
import Link from "next/link";
import { UiBadge, UiButton, UiSurface } from "@realize/ui-kit";
import type { TaskDetailProps } from "./TaskManager.types";
import { taskPriorityLabels, taskStatusLabels } from "./taskManager.constants";
import { TaskGitObservations } from "./TaskGitObservations.component";
import { auditDossierSections } from "./dossier/taskAuditDossier.constants";
import styles from "./TaskManagerWorkbench.module.css";

export function TaskDetail({
  task,
  events,
  participants,
  auditDossierHref,
  moreEvents,
  eventsLoading,
  onMoreEvents,
  onEdit,
  onClose,
}: TaskDetailProps) {
  const actorName = (id: string) =>
    participants.find((actor) => actor.id === id)?.name ?? id;
  return (
    <UiSurface className={styles.detail}>
      <header className={styles.sectionHeading}>
        <div className={styles.stack}>
          <span className={styles.muted}>
            {task.key} · Ревизия {task.revision}
          </span>
          <h2>{task.title}</h2>
        </div>
        <div className={styles.actions}>
          <UiButton variant="secondary" size="small" onClick={onEdit}>
            Редактировать
          </UiButton>
          <UiButton variant="ghost" size="small" onClick={onClose}>
            Закрыть карточку
          </UiButton>
        </div>
      </header>
      <div className={styles.actions}>
        <UiBadge>{taskStatusLabels[task.status]}</UiBadge>
        <UiBadge>{taskPriorityLabels[task.priority]}</UiBadge>
      </div>
      {auditDossierHref && (
        <nav className={styles.stack} aria-label="Материалы аудита">
          <h3>
            <Link prefetch={false} href={auditDossierHref}>
              Досье аудита
            </Link>
          </h3>
          <div className={styles.actions}>
            {auditDossierSections.map(({ anchor, label }) => (
              <Link
                key={anchor}
                prefetch={false}
                href={`${auditDossierHref}#${anchor}`}
              >
                {label}
              </Link>
            ))}
          </div>
        </nav>
      )}
      <p className={styles.description}>
        {task.description || "Описание не заполнено."}
      </p>
      <dl className={styles.metadata}>
        <dt>Исполнитель</dt>
        <dd>{task.assigneeId ? actorName(task.assigneeId) : "Не назначен"}</dd>
        <dt>Создал</dt>
        <dd>{actorName(task.createdBy)}</dd>
        <dt>Изменил</dt>
        <dd>{actorName(task.updatedBy)}</dd>
        <dt>ID</dt>
        <dd className={styles.sha}>{task.id}</dd>
      </dl>
      <section className={styles.stack}>
        <h3>Репозитории и коммиты</h3>
        {task.gitBindings.length ? (
          task.gitBindings.map((binding, index) => (
            <UiSurface key={index} tone="raised" className={styles.binding}>
              <div className={styles.sectionHeading}>
                <strong>{binding.repositoryId}</strong>
                <UiBadge>Вручную · Не проверено</UiBadge>
              </div>
              <p>
                {binding.purpose === "platform-core"
                  ? "Код платформы"
                  : "Код проекта"}
              </p>
              <code className={styles.sha}>{binding.commitSha}</code>
            </UiSurface>
          ))
        ) : (
          <p className={styles.muted}>Привязки не добавлены.</p>
        )}
      </section>
      <TaskGitObservations task={task} participants={participants} />
      <section className={styles.stack} aria-label="История задачи">
        <h3>История</h3>
        {events.length ? (
          <ol className={styles.history}>
            {events.map((event) => (
              <li key={event.id}>
                <strong>{event.summary}</strong>
                <span className={styles.muted}>
                  {actorName(event.actorId)} · Ревизия {event.revision} ·{" "}
                  <time dateTime={event.occurredAt}>
                    {new Date(event.occurredAt).toLocaleString("ru-RU")}
                  </time>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.muted}>
            История загружается или пока недоступна.
          </p>
        )}
        {moreEvents && (
          <div>
            <UiButton
              variant="ghost"
              size="small"
              disabled={eventsLoading}
              onClick={onMoreEvents}
            >
              {eventsLoading ? "Загрузка…" : "Ещё события"}
            </UiButton>
          </div>
        )}
      </section>
    </UiSurface>
  );
}
