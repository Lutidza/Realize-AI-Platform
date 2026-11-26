/**
 * @file .ai/tools/worker-assignment/test/publication/foundationTask.fixture.ts
 * @version 13.0.3
 * @date 2026-11-26
 * @description Создаёт участников ревью и сохраняет задачу Foundation для тестов публикации.
 * @see documentation/specifications/task-management/execution/audit-report-publication.md
 */
import type { Pool } from "pg";
import {
  taskCreateSchema,
  taskListSchema,
  taskProjectSchema,
  taskSchema,
} from "@realize/payload-task-manager/contracts";
import {
  withAuditTransaction,
  type AuditTaskBinding,
} from "@realize/payload-task-manager/audit-review";
import type { ReviewParticipant } from "./AuditReviewParticipants.types";
import type { FoundationTaskFields } from "./FoundationTask.types";
import { assertFoundationMembership } from "./foundationMembership.validator";

/** Возвращает ID созданных участников в порядке входного списка. */
export async function createReviewParticipants(
  pool: Pool,
  participants: readonly ReviewParticipant[],
) {
  return withAuditTransaction(pool, async (client) => {
    const ids: string[] = [];
    for (const { name, email } of participants) {
      const user = await client.query<{ id: string }>(
        "INSERT INTO public.users(name,email) VALUES($1,$2) RETURNING id::text AS id",
        [name, email],
      );
      ids.push(user.rows[0].id);
    }
    return ids;
  });
}

export async function persistFoundationTask(
  pool: Pool,
  task: AuditTaskBinding,
  fields: FoundationTaskFields,
  {
    ownerId,
    createdBy,
    assigneeId,
    memberIds,
  }: {
    ownerId: string;
    createdBy: string;
    assigneeId: string | null;
    memberIds: readonly string[];
  },
) {
  assertFoundationMembership({
    owner: ownerId,
    taskAuthor: createdBy,
    assignee: assigneeId,
    members: memberIds,
  });
  const timestamps = {
    createdAt: fields.createdAt,
    updatedAt: fields.createdAt,
  };
  const project = taskProjectSchema.parse({
    ...timestamps,
    revision: 1,
    id: task.projectId,
    title: fields.projectTitle,
    description: fields.projectDescription,
    ownerId,
    memberIds,
  });
  const list = taskListSchema.parse({
    ...timestamps,
    revision: 1,
    id: fields.listId,
    projectId: project.id,
    title: fields.listTitle,
  });
  const taskFields = {
    ...timestamps,
    revision: taskSchema.shape.revision.parse(task.taskRevision),
    id: task.taskId,
    ...taskCreateSchema.parse({
      projectId: project.id,
      listId: list.id,
      title: fields.taskTitle,
      description: fields.taskDescription,
      status: fields.status,
      priority: fields.priority,
      assigneeId,
      gitBindings: fields.gitBindings,
    }),
    createdBy,
    updatedBy: createdBy,
  };
  return withAuditTransaction(pool, async (client) => {
    const row = await client.query(
      `INSERT INTO public.realize_task_projects(project_id,owner_id,record,created_at,updated_at)
       VALUES($1,$2,$3,$4,$4) RETURNING id`,
      [project.id, ownerId, project, project.createdAt],
    );
    for (const [order, memberId] of project.memberIds.entries())
      await client.query(
        "INSERT INTO public.realize_task_projects_rels(parent_id,path,users_id,\"order\") VALUES($1,'members',$2,$3)",
        [row.rows[0].id, memberId, order + 1],
      );
    await client.query(
      `INSERT INTO public.realize_task_lists(list_id,project_id,record,created_at,updated_at)
       VALUES($1,$2,$3,$4,$4)`,
      [list.id, project.id, list, list.createdAt],
    );
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO public.realize_tasks(task_id,project_id,list_id,revision,record,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
      [
        taskFields.id,
        project.id,
        list.id,
        taskFields.revision,
        taskFields,
        taskFields.createdAt,
      ],
    );
    const rowId = inserted.rows[0].id;
    const saved = await client.query<{ record: unknown }>(
      "UPDATE public.realize_tasks SET record=$2 WHERE id=$1 RETURNING record",
      [rowId, { ...taskFields, key: `TASK-${rowId}` }],
    );
    return taskSchema.parse(saved.rows[0]?.record);
  });
}
