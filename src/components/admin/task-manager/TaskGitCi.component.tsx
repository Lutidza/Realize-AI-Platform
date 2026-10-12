/**
 * @file src/components/admin/task-manager/TaskGitCi.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Показывает checks и legacy statuses без вывода о required checks или приёмке задачи.
 * @see documentation/specifications/task-management-execution.md
 */
import type { TaskGitCiProps } from "./TaskGitCi.types";
import { taskGitCiLabels } from "./taskManager.constants";

/** Reruns остаются отдельными фактами; пустая/неполная выборка не подтверждает успешный CI. */
export function TaskGitCi({ ci }: TaskGitCiProps) {
  return (
    <section aria-label="CI коммита">
      <h4>CI этого коммита</h4>
      <p>Checks</p>
      {ci.checkRuns.status === "unavailable" ? (
        <p>Проверки CI недоступны.</p>
      ) : (
        <>
          {ci.checkRuns.items.length ? (
            <ul>
              {ci.checkRuns.items.map((check) => (
                <li key={check.id}>
                  <a href={check.url} target="_blank" rel="noopener noreferrer">
                    {check.name}
                  </a>
                  {" · "}
                  {taskGitCiLabels[check.conclusion ?? check.status]}
                </li>
              ))}
            </ul>
          ) : (
            <p>GitHub не вернул проверок.</p>
          )}
          {!ci.checkRuns.complete && (
            <p>
              Показано {ci.checkRuns.items.length} из {ci.checkRuns.totalCount}{" "}
              checks; выборка неполная.
            </p>
          )}
        </>
      )}
      <p>Статусы коммита</p>
      {ci.commitStatuses.status === "unavailable" ? (
        <p>Статусы CI недоступны.</p>
      ) : (
        <>
          {ci.commitStatuses.items.length ? (
            <ul>
              {ci.commitStatuses.items.map((status) => (
                <li key={status.id}>
                  {status.context}
                  {" · "}
                  {taskGitCiLabels[status.state]}
                </li>
              ))}
            </ul>
          ) : (
            <p>GitHub не вернул статусов.</p>
          )}
          <p>
            Сводка legacy statuses:{" "}
            {taskGitCiLabels[ci.commitStatuses.combinedState]}.
          </p>
          {!ci.commitStatuses.complete && (
            <p>
              Показано {ci.commitStatuses.items.length} из{" "}
              {ci.commitStatuses.totalCount} статусов; выборка неполная.
            </p>
          )}
        </>
      )}
      <p>Эти сведения не определяют обязательные проверки и приёмку задачи.</p>
    </section>
  );
}
