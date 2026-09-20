/**
 * @file src/components/admin/task-manager/reference/TaskDetailActivity.component.tsx
 * @version 1.0.0
 * @date 2026-09-17
 * @description Отображает историю задачи и сохраняет комментарий только после успешной команды.
 * @see documentation/specifications/task-management.md
 */

import { useState } from "react";
import { UiButton, UiTextarea } from "@realize/ui-kit";
import { History, MessageSquare, Send } from "lucide-react";
import type { TaskDetailActivityProps } from "./TaskDetail.types";
import styles from "./TaskDetailDrawer.module.css";

export function TaskDetailActivity({
  task,
  dispatch,
}: TaskDetailActivityProps) {
  const [comment, setComment] = useState("");
  return (
    <aside className={styles.activity} aria-label="История задачи">
      <div className={styles.activityHeader}>
        <h3>
          <History size={17} /> Активность
        </h3>
        <span>{task.activity.length}</span>
      </div>
      <div className={styles.activityEntries}>
        {task.activity.map((item) => (
          <article className={styles.activityItem} key={item.id}>
            <div className={styles.activityAuthor}>
              <span className={styles.avatar}>{item.author.slice(0, 1)}</span>
              <strong>{item.author}</strong>
              <time>{item.time}</time>
            </div>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
      <form
        className={styles.commentForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (!comment.trim()) return;
          const result = dispatch({
            type: "task/comment",
            taskId: task.id,
            text: comment.trim(),
          });
          if (result.ok) setComment("");
        }}
      >
        <UiTextarea
          aria-label="Комментарий к задаче"
          placeholder="Написать комментарий…"
          rows={3}
          value={comment}
          maxLength={2000}
          onChange={(event) => setComment(event.target.value)}
        />
        <div>
          <span className={styles.muted}>
            <MessageSquare size={14} /> Обсуждение задачи
          </span>
          <UiButton
            type="submit"
            size="icon"
            disabled={!comment.trim()}
            aria-label="Отправить комментарий"
          >
            <Send size={16} />
          </UiButton>
        </div>
      </form>
    </aside>
  );
}
