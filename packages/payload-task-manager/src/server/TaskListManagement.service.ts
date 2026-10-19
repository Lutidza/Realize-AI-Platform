/**
 * @file packages/payload-task-manager/src/server/TaskListManagement.service.ts
 * @version 1.1.0
 * @date 2026-10-19
 * @description Создаёт и переименовывает списки текущих участников с replay и revision CAS.
 * @see documentation/specifications/task-management-execution.md
 */
import { randomUUID } from "node:crypto";
import type { TaskListDto } from "../contracts/TaskManager.types";
import {
  taskListCreateSchema,
  taskListUpdateSchema,
  taskPublicIdSchema,
} from "../contracts/taskManager.schemas";
import { TASK_LISTS_SLUG } from "../taskManager.constants";
import type { TaskContainerManagementContext } from "./TaskContainerManagement.types";
import type { TaskActor } from "./TaskStorage.types";
import { TaskStoreRepository } from "./TaskStore.repository";
import { TaskManagerError } from "./TaskManager.error";
import { mapTaskList } from "./mapTask.mapper";
import { parseTaskCommand } from "./parseTaskCommand.validator";
import { withTaskMutation } from "./withTaskMutation.service";
import { assertIndependentTaskTransaction } from "./withTaskTransaction.repository";

export class TaskListManagementService {
  private readonly repository: TaskStoreRepository;

  constructor(private readonly context: TaskContainerManagementContext) {
    this.repository = new TaskStoreRepository(context.req);
  }

  async read(listId: string): Promise<TaskListDto> {
    const actor = await this.context.authorize();
    return (await this.memberList(listId, actor)).list;
  }

  async create(value: unknown): Promise<TaskListDto> {
    const actor = await this.context.authorize("write");
    await assertIndependentTaskTransaction(this.context.req);
    const input = parseTaskCommand(taskListCreateSchema, value);
    return withTaskMutation({
      req: this.context.req,
      actorId: actor.id,
      projectId: input.projectId,
      operation: "create-list",
      command: input,
      authorize: async () => {
        await this.context.authorize("write");
        await this.context.readProject(input.projectId, actor);
      },
      readReceipt: mapTaskList,
      work: async () => {
        const now = new Date().toISOString();
        const list: TaskListDto = {
          id: randomUUID(),
          ...input,
          revision: 1,
          createdAt: now,
          updatedAt: now,
        };
        await this.repository.create(TASK_LISTS_SLUG, {
          listId: list.id,
          projectId: list.projectId,
          record: list,
        });
        return { result: mapTaskList(list), projectId: list.projectId };
      },
    });
  }

  async update(listId: string, value: unknown): Promise<TaskListDto> {
    const actor = await this.context.authorize("write");
    await assertIndependentTaskTransaction(this.context.req);
    const input = parseTaskCommand(taskListUpdateSchema, value);
    const initial = await this.memberList(listId, actor);
    return withTaskMutation({
      req: this.context.req,
      actorId: actor.id,
      projectId: initial.list.projectId,
      operation: `update-list:${listId}`,
      command: input,
      authorize: async () => {
        await this.context.authorize("write");
        await this.memberList(listId, actor);
      },
      readReceipt: mapTaskList,
      work: async () => {
        const { row, list: current } = await this.memberList(listId, actor);
        if (current.revision !== input.expectedRevision)
          throw new TaskManagerError(
            "REVISION_CONFLICT",
            "Список изменён. Загрузите актуальную версию.",
            409,
          );
        if (current.title === input.title)
          return { result: current, projectId: current.projectId };
        const list = mapTaskList({
          ...current,
          title: input.title,
          revision: current.revision + 1,
          updatedAt: new Date().toISOString(),
        });
        await this.repository.update(TASK_LISTS_SLUG, row.id, { record: list });
        return { result: list, projectId: list.projectId };
      },
    });
  }

  private async memberList(listId: string, actor: TaskActor) {
    parseTaskCommand(taskPublicIdSchema, listId);
    const row = await this.repository.findOne(TASK_LISTS_SLUG, {
      listId: { equals: listId },
    });
    if (!row) throw new TaskManagerError("NOT_FOUND", "Список не найден.", 404);
    const list = mapTaskList(row.record);
    await this.context.readProject(list.projectId, actor);
    return { row, list };
  }
}
