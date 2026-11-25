/**
 * @file .ai/tools/worker-assignment/test/publication/foundationTask.fixture.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Разворачивает исходную схему Foundation и сохраняет валидную задачу в одноразовой БД.
 * @see documentation/specifications/task-management/execution/article-audit-publication.md
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  taskListSchema,
  taskProjectSchema,
  taskSchema,
} from "@realize/payload-task-manager/contracts";
import {
  withAuditTransaction,
  type AuditTaskBinding,
} from "@realize/payload-task-manager/audit-review";
export async function createReviewParticipants(pool: Pool) {
  return withAuditTransaction(pool, async (client) => {
    const ids: string[] = [];
    for (const name of [
      "Аудитор",
      "Автор реализации",
      "Frontend-ревьюер",
      "Второй независимый ревьюер",
    ]) {
      const user = await client.query(
        "INSERT INTO public.users(name,email) VALUES($1,$2) RETURNING id::text AS id",
        [name, randomUUID() + "@example.invalid"],
      );
      ids.push(user.rows[0].id);
    }
    return ids;
  });
}

export async function persistFoundationTask(
  pool: Pool,
  task: AuditTaskBinding,
  participants: string[],
) {
  const now = new Date().toISOString();
  const ownerId = participants[0];
  const base = { revision: 1, createdAt: now, updatedAt: now };
  const project = taskProjectSchema.parse({
    ...base,
    id: task.projectId,
    title: "Пилот документации",
    description: "",
    ownerId,
    memberIds: participants,
  });
  const list = taskListSchema.parse({
    ...base,
    id: randomUUID(),
    projectId: project.id,
    title: "Аудит",
  });
  const record = taskSchema.parse({
    ...base,
    id: task.taskId,
    key: "TASK-1",
    projectId: project.id,
    listId: list.id,
    title: "Проверить форму создания статьи",
    description: "",
    status: "review",
    priority: "normal",
    assigneeId: null,
    gitBindings: [],
    createdBy: ownerId,
    updatedBy: ownerId,
  });
  await withAuditTransaction(pool, async (client) => {
    const row = await client.query(
      "INSERT INTO public.realize_task_projects(project_id,owner_id,record) VALUES($1,$2,$3) RETURNING id",
      [project.id, ownerId, project],
    );
    for (const [order, memberId] of participants.entries())
      await client.query(
        "INSERT INTO public.realize_task_projects_rels(parent_id,path,users_id,\"order\") VALUES($1,'members',$2,$3)",
        [row.rows[0].id, memberId, order + 1],
      );
    await client.query(
      "INSERT INTO public.realize_task_lists(list_id,project_id,record) VALUES($1,$2,$3)",
      [list.id, project.id, list],
    );
    await client.query(
      "INSERT INTO public.realize_tasks(task_id,project_id,list_id,revision,record) VALUES($1,$2,$3,$4,$5)",
      [record.id, project.id, list.id, record.revision, record],
    );
  });
}
