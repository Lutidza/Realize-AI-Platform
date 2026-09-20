/**
 * @file src/components/admin/task-manager/reference/TaskDetailGit.component.tsx
 * @version 1.0.0
 * @date 2026-09-17
 * @description Показывает происхождение связей Git и безопасные переходы к результатам.
 * @see documentation/specifications/task-management.md
 */

import { UiBadge, UiButton } from "@realize/ui-kit";
import { ExternalLink, GitBranch, Plus } from "lucide-react";
import { gitKindLabels, gitStatusLabels } from "./taskComposer.constants";
import type { TaskDetailOverviewProps } from "./TaskDetail.types";
import styles from "./TaskDetailDrawer.module.css";

export function TaskDetailGit({
  task,
  onEdit,
}: Pick<TaskDetailOverviewProps, "task" | "onEdit">) {
  return (
    <section className={styles.overview}>
      <div className={styles.sectionHeader}>
        <h3>Git и доставка</h3>
        <UiButton
          size="small"
          variant="secondary"
          onClick={() => onEdit("git")}
          disabled={task.archived}
        >
          <Plus size={15} /> Добавить связь
        </UiButton>
      </div>
      <p className={styles.muted}>
        Ручные ссылки не подтверждают push или успех проверки. Демонстрационные
        события явно отмечены.
      </p>
      {!task.gitLinks.length && (
        <p className={styles.empty}>
          Свяжите задачу с веткой, коммитом, push, pull request, сборкой CI или
          релизом.
        </p>
      )}
      {task.gitLinks.map((link) => (
        <article className={styles.gitCard} key={link.id}>
          <div className={styles.sectionHeader}>
            <span className={styles.gitKind}>
              <GitBranch size={16} />
              {gitKindLabels[link.kind]}
            </span>
            <UiBadge>
              {link.source === "demo" ? "Пример" : "Вручную"} ·{" "}
              {gitStatusLabels[link.status]}
            </UiBadge>
          </div>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.gitLink}
          >
            {link.label}
            <ExternalLink size={15} aria-hidden="true" />
          </a>
          {(link.repository || link.revision) && (
            <p className={styles.gitRevision}>
              {[link.repository, link.revision].filter(Boolean).join(" · ")}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
