/**
 * @file packages/payload-task-manager/src/server/TaskManager.service.ts
 * @version 1.0.1
 * @date 2026-10-11
 * @description Координирует membership, постоянные задачи и revision CAS без AI или Git provider исполнения.
 * @see documentation/specifications/task-management-execution.md
 */
import { randomUUID } from "node:crypto";
import type { PayloadRequest } from "payload";
import type {
  TaskDto,
  TaskEventDto,
  TaskListDto,
  TaskPageDto,
  TaskParticipantDto,
  TaskProjectDto,
} from "../contracts/TaskManager.types";
import {
  taskCreateSchema,
  taskProjectCreateSchema,
  taskPublicIdSchema,
  taskUpdateSchema,
} from "../contracts/taskManager.schemas";
import type { ResolvedTaskManagerOptions } from "../TaskManagerOptions.types";
import {
  TASK_EVENTS_SLUG,
  TASK_FIELD_LABELS,
  TASK_LISTS_SLUG,
  TASK_PROJECTS_SLUG,
  TASKS_SLUG,
} from "../taskManager.constants";
import type { TaskActor, TaskProjectRecord } from "./TaskStorage.types";
import { TaskStoreRepository } from "./TaskStore.repository";
import { TaskParticipantsRepository } from "./TaskParticipants.repository";
import { TaskManagerError } from "./TaskManager.error";
import {
  mapTask,
  mapTaskEvent,
  mapTaskList,
  mapTaskProject,
} from "./mapTask.mapper";
import { parseTaskCommand } from "./parseTaskCommand.validator";
import { withTaskMutation } from "./withTaskMutation.service";
import { assertIndependentTaskTransaction } from "./withTaskTransaction.repository";

/** Все публичные методы авторизуют req.user; actorId не принимается от клиента. */
export class TaskManagerService {
  private readonly repository: TaskStoreRepository;
  private readonly participantsRepository: TaskParticipantsRepository;
  constructor(
    private readonly req: PayloadRequest,
    private readonly options: ResolvedTaskManagerOptions,
  ) {
    this.repository = new TaskStoreRepository(req);
    this.participantsRepository = new TaskParticipantsRepository(req, options);
  }

  async authorize(): Promise<TaskActor> {
    const user = this.req.user;
    if (!user)
      throw new TaskManagerError(
        "UNAUTHENTICATED",
        "Требуется авторизация.",
        401,
      );
    if (
      user.collection !== this.options.userCollection ||
      !(await this.options.canUseTaskManager({ req: this.req }))
    )
      throw new TaskManagerError(
        "FORBIDDEN",
        "Нет доступа к Task Manager.",
        403,
      );
    return { id: String(user.id), payloadId: user.id };
  }

  async participants(
    after: string | null = null,
  ): Promise<TaskPageDto<TaskParticipantDto>> {
    await this.authorize();
    return this.participantsRepository.page(after);
  }

  async projects(
    after: string | null = null,
  ): Promise<TaskPageDto<TaskProjectDto>> {
    const actor = await this.authorize();
    const page = await this.repository.page(
      TASK_PROJECTS_SLUG,
      { members: { contains: actor.payloadId } },
      after,
    );
    return {
      items: page.rows.map((row) => mapTaskProject(row.record)),
      nextCursor: page.nextCursor,
    };
  }

  async createProject(value: unknown): Promise<TaskProjectDto> {
    const actor = await this.authorize();
    await assertIndependentTaskTransaction(this.req);
    const input = parseTaskCommand(taskProjectCreateSchema, value);
    return withTaskMutation({
      req: this.req,
      actorId: actor.id,
      projectId: null,
      operation: "create-project",
      command: input,
      authorize: async () => {
        await this.authorize();
      },
      readReceipt: async (receipt) => {
        const project = mapTaskProject(receipt);
        await this.project(project.id, actor);
        return project;
      },
      work: async () => {
        const memberIds = [...new Set([actor.id, ...input.memberIds])];
        const members = await this.participantsRepository.members(memberIds);
        const now = new Date().toISOString();
        const project: TaskProjectDto = {
          id: randomUUID(),
          title: input.title,
          description: input.description,
          ownerId: actor.id,
          memberIds,
          revision: 1,
          createdAt: now,
          updatedAt: now,
        };
        const list: TaskListDto = {
          id: randomUUID(),
          projectId: project.id,
          title: "Задачи",
          revision: 1,
          createdAt: now,
          updatedAt: now,
        };
        await this.repository.create(TASK_PROJECTS_SLUG, {
          projectId: project.id,
          ownerId: actor.id,
          members,
          record: project,
        });
        await this.repository.create(TASK_LISTS_SLUG, {
          listId: list.id,
          projectId: project.id,
          record: list,
        });
        return { result: mapTaskProject(project), projectId: project.id };
      },
    });
  }

  async lists(
    projectId: string,
    after: string | null = null,
  ): Promise<TaskPageDto<TaskListDto>> {
    const actor = await this.authorize();
    await this.project(projectId, actor);
    const page = await this.repository.page(
      TASK_LISTS_SLUG,
      { projectId: { equals: projectId } },
      after,
    );
    return {
      items: page.rows.map((row) => mapTaskList(row.record)),
      nextCursor: page.nextCursor,
    };
  }

  async tasks(
    projectId: string,
    listId: string,
    after: string | null = null,
  ): Promise<TaskPageDto<TaskDto>> {
    const actor = await this.authorize();
    await this.project(projectId, actor);
    await this.list(projectId, listId);
    const page = await this.repository.page(
      TASKS_SLUG,
      {
        and: [
          { projectId: { equals: projectId } },
          { listId: { equals: listId } },
        ],
      },
      after,
    );
    return {
      items: page.rows.map((row) => mapTask(row.record)),
      nextCursor: page.nextCursor,
    };
  }

  async task(taskId: string): Promise<TaskDto> {
    const actor = await this.authorize();
    return (await this.ownedTask(taskId, actor)).task;
  }

  async events(
    taskId: string,
    after: string | null = null,
  ): Promise<TaskPageDto<TaskEventDto>> {
    const task = await this.task(taskId);
    const page = await this.repository.page(
      TASK_EVENTS_SLUG,
      {
        and: [
          { taskId: { equals: task.id } },
          { projectId: { equals: task.projectId } },
        ],
      },
      after,
    );
    return {
      items: page.rows.map((row) => mapTaskEvent(row.record)),
      nextCursor: page.nextCursor,
    };
  }

  async createTask(value: unknown): Promise<TaskDto> {
    const actor = await this.authorize();
    await assertIndependentTaskTransaction(this.req);
    const input = parseTaskCommand(taskCreateSchema, value);
    return withTaskMutation({
      req: this.req,
      actorId: actor.id,
      projectId: input.projectId,
      operation: "create-task",
      command: input,
      authorize: async () => {
        await this.authorize();
        await this.project(input.projectId, actor);
      },
      readReceipt: mapTask,
      work: async () => {
        const { project } = await this.project(input.projectId, actor);
        await this.list(input.projectId, input.listId);
        await this.assignee(project, input.assigneeId);
        const now = new Date().toISOString();
        const task: TaskDto = {
          id: randomUUID(),
          key: "TASK-1",
          projectId: input.projectId,
          listId: input.listId,
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          assigneeId: input.assigneeId,
          gitBindings: input.gitBindings,
          revision: 1,
          createdBy: actor.id,
          updatedBy: actor.id,
          createdAt: now,
          updatedAt: now,
        };
        const row = await this.repository.create(TASKS_SLUG, {
          taskId: task.id,
          projectId: task.projectId,
          listId: task.listId,
          revision: task.revision,
          record: task,
        });
        // Внутренний numeric PK задаёт читабельный key; UUID остаётся устойчивым публичным ID.
        if (!/^[1-9][0-9]*$/.test(String(row.id)))
          throw new TaskManagerError(
            "STORAGE_UNAVAILABLE",
            "Хранилище задач требует числовой идентификатор записи.",
            503,
          );
        task.key = `TASK-${row.id}`;
        await this.repository.update(TASKS_SLUG, row.id, { record: task });
        await this.appendEvent(task, "created", "Задача создана.");
        return { result: mapTask(task), projectId: task.projectId };
      },
    });
  }

  async updateTask(taskId: string, value: unknown): Promise<TaskDto> {
    const actor = await this.authorize();
    await assertIndependentTaskTransaction(this.req);
    const input = parseTaskCommand(taskUpdateSchema, value);
    const initial = await this.ownedTask(taskId, actor);
    return withTaskMutation({
      req: this.req,
      actorId: actor.id,
      projectId: initial.task.projectId,
      operation: `update-task:${taskId}`,
      command: input,
      authorize: async () => {
        await this.authorize();
        await this.project(initial.task.projectId, actor);
      },
      readReceipt: mapTask,
      work: async () => {
        const {
          row,
          task: current,
          project,
        } = await this.ownedTask(taskId, actor);
        if (current.revision !== input.expectedRevision)
          throw new TaskManagerError(
            "REVISION_CONFLICT",
            "Задача изменена другим участником. Загрузите актуальную версию.",
            409,
          );
        await this.assignee(project, input.assigneeId);
        const task: TaskDto = {
          id: current.id,
          key: current.key,
          projectId: current.projectId,
          listId: current.listId,
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          assigneeId: input.assigneeId,
          gitBindings: input.gitBindings,
          revision: current.revision + 1,
          createdBy: current.createdBy,
          updatedBy: actor.id,
          createdAt: current.createdAt,
          updatedAt: new Date().toISOString(),
        };
        const changes = [
          "title",
          "description",
          "status",
          "priority",
          "assigneeId",
          "gitBindings",
        ] as const;
        const changed = changes.filter(
          (field) =>
            JSON.stringify(current[field]) !== JSON.stringify(task[field]),
        );
        if (changed.length === 0)
          return { result: current, projectId: current.projectId };
        await this.repository.update(TASKS_SLUG, row.id, {
          revision: task.revision,
          record: task,
        });
        await this.appendEvent(
          task,
          "updated",
          `Изменены поля: ${changed.map((field) => TASK_FIELD_LABELS[field]).join(", ")}.`,
        );
        return { result: mapTask(task), projectId: task.projectId };
      },
    });
  }

  private async project(
    projectId: string,
    actor: TaskActor,
  ): Promise<TaskProjectRecord> {
    parseTaskCommand(taskPublicIdSchema, projectId);
    const row = await this.repository.findOne(TASK_PROJECTS_SLUG, {
      projectId: { equals: projectId },
    });
    if (!row) throw new TaskManagerError("NOT_FOUND", "Проект не найден.", 404);
    const project = mapTaskProject(row.record);
    if (!project.memberIds.includes(actor.id))
      throw new TaskManagerError("NOT_FOUND", "Проект не найден.", 404);
    return { row, project };
  }

  private async list(projectId: string, listId: string): Promise<TaskListDto> {
    parseTaskCommand(taskPublicIdSchema, listId);
    const row = await this.repository.findOne(TASK_LISTS_SLUG, {
      and: [
        { listId: { equals: listId } },
        { projectId: { equals: projectId } },
      ],
    });
    if (!row)
      throw new TaskManagerError(
        "NOT_FOUND",
        "Список не найден в проекте.",
        404,
      );
    return mapTaskList(row.record);
  }

  private async ownedTask(taskId: string, actor: TaskActor) {
    parseTaskCommand(taskPublicIdSchema, taskId);
    const row = await this.repository.findOne(TASKS_SLUG, {
      taskId: { equals: taskId },
    });
    if (!row)
      throw new TaskManagerError("NOT_FOUND", "Задача не найдена.", 404);
    const task = mapTask(row.record);
    const { project } = await this.project(task.projectId, actor);
    return { row, task, project };
  }

  private async assignee(
    project: TaskProjectDto,
    assigneeId: string | null,
  ): Promise<void> {
    if (assigneeId === null) return;
    if (!project.memberIds.includes(assigneeId))
      throw new TaskManagerError(
        "INVALID_REQUEST",
        "Исполнитель должен быть участником проекта.",
        422,
        { assigneeId: ["Выберите участника проекта."] },
      );
    await this.participantsRepository.members([assigneeId]);
  }

  private async appendEvent(
    task: TaskDto,
    kind: TaskEventDto["kind"],
    summary: string,
  ): Promise<void> {
    const event: TaskEventDto = {
      id: randomUUID(),
      taskId: task.id,
      actorId: task.updatedBy,
      kind,
      revision: task.revision,
      occurredAt: task.updatedAt,
      summary,
    };
    await this.repository.create(TASK_EVENTS_SLUG, {
      eventId: event.id,
      taskId: task.id,
      projectId: task.projectId,
      actorId: event.actorId,
      revision: event.revision,
      record: event,
    });
  }
}
