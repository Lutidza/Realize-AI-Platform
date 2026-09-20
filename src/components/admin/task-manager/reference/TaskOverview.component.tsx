/**
 * @file src/components/admin/task-manager/reference/TaskOverview.component.tsx
 * @version 1.0.0
 * @date 2026-09-17
 * @description Сводит готовность проекта и задачи, требующие внимания.
 */

import {
  ArrowUpRight,
  CheckCheck,
  CircleAlert,
  Layers,
  Workflow,
} from "lucide-react";
import { UiButton } from "@realize/ui-kit";
import type { TaskOverviewProps } from "./TaskWorkbench.types";
import { TaskRunBadge } from "./TaskParticipants.component";
import styles from "./TaskOverview.module.css";

export function TaskOverview({
  tasks,
  onOpenTask,
  onQueue,
}: TaskOverviewProps) {
  const done = tasks.filter((task) => task.status === "done").length;
  const blocked = tasks.filter((task) => task.run.state === "blocked");
  const attention = tasks.filter(
    (task) => task.status === "review" || task.run.state === "blocked",
  );
  return (
    <div className={styles.overview}>
      <div className={styles.metrics}>
        <article>
          <Layers size={20} />
          <span>Всего задач</span>
          <strong>{tasks.length}</strong>
        </article>
        <article>
          <Workflow size={20} />
          <span>В работе</span>
          <strong>
            {tasks.filter((task) => task.status === "in_progress").length}
          </strong>
        </article>
        <article>
          <CheckCheck size={20} />
          <span>Завершено</span>
          <strong>{done}</strong>
        </article>
        <article>
          <CircleAlert size={20} />
          <span>Блокировки</span>
          <strong>{blocked.length}</strong>
        </article>
      </div>
      <section className={styles.progress}>
        <div>
          <h2>Прогресс проекта</h2>
          <strong>
            {tasks.length ? Math.round((done / tasks.length) * 100) : 0}%
          </strong>
        </div>
        <progress
          aria-label="Завершённые задачи"
          value={done}
          max={tasks.length || 1}
        />
        <p>
          {done} из {tasks.length} задач приняты. Результат запуска ожидает
          отдельной проверки.
        </p>
      </section>
      <section className={styles.attention}>
        <header>
          <div>
            <span>Фокус команды</span>
            <h2>Требуют внимания</h2>
          </div>
          <UiButton variant="secondary" size="small" onClick={onQueue}>
            Очередь AI
            <ArrowUpRight size={15} />
          </UiButton>
        </header>
        {attention.length ? (
          attention.map((task) => (
            <div key={task.id}>
              <UiButton variant="ghost" onClick={() => onOpenTask(task.id)}>
                <span>
                  {task.title}
                  <small>
                    {task.id} ·{" "}
                    {task.run.reason || "Ожидает проверки результата"}
                  </small>
                </span>
              </UiButton>
              <TaskRunBadge state={task.run.state} />
            </div>
          ))
        ) : (
          <p>Открытых блокировок и задач на проверке нет.</p>
        )}
      </section>
    </div>
  );
}
