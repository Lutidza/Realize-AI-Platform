/**
 * @file packages/payload-task-manager/src/server/TaskProjectManagement.service.ts
 * @version 1.1.0
 * @date 2026-10-19
 * @description Читает проекты и атомарно изменяет metadata и membership по правам владельца.
 * @see documentation/specifications/task-management-execution.md
 */
import type { TaskProjectDto } from "../contracts/TaskManager.types";
import { taskProjectUpdateSchema } from "../contracts/taskManager.schemas";
import { TASK_PROJECTS_SLUG } from "../taskManager.constants";
import type { TaskContainerManagementContext } from "./TaskContainerManagement.types";
import type { TaskActor } from "./TaskStorage.types";
import { TaskStoreRepository } from "./TaskStore.repository";
import { TaskParticipantsRepository } from "./TaskParticipants.repository";
import { TaskManagerError } from "./TaskManager.error";
import { mapTaskProject } from "./mapTask.mapper";
import { parseTaskCommand } from "./parseTaskCommand.validator";
import { withTaskMutation } from "./withTaskMutation.service";
import { assertIndependentTaskTransaction } from "./withTaskTransaction.repository";

export class TaskProjectManagementService {
  private readonly repository: TaskStoreRepository;
  private readonly participants: TaskParticipantsRepository;

  constructor(private readonly context: TaskContainerManagementContext) {
    this.repository = new TaskStoreRepository(context.req);
    this.participants = new TaskParticipantsRepository(
      context.req,
      context.options,
    );
  }

  async read(projectId: string): Promise<TaskProjectDto> {
    const actor = await this.context.authorize();
    return (await this.context.readProject(projectId, actor)).project;
  }

  /** Owner остаётся неизменным; удаление участника не переписывает связанные задачи. */
  async update(projectId: string, value: unknown): Promise<TaskProjectDto> {
    const actor = await this.context.authorize("projects");
    await assertIndependentTaskTransaction(this.context.req);
    const input = parseTaskCommand(taskProjectUpdateSchema, value);
    const initial = await this.ownedProject(projectId, actor);
    const memberIds = [
      ...new Set([initial.project.ownerId, ...input.memberIds]),
    ].sort();
    if (memberIds.length > 101)
      throw new TaskManagerError(
        "INVALID_REQUEST",
        "В проекте допускается не более 100 участников помимо владельца.",
        422,
        { memberIds: ["Сократите список участников."] },
      );
    // Каноническое множество делает перестановку и явное включение owner одним запросом.
    const command = { ...input, memberIds };
    return withTaskMutation({
      req: this.context.req,
      actorId: actor.id,
      projectId,
      operation: `update-project:${projectId}`,
      command,
      authorize: async () => {
        await this.context.authorize("projects");
        await this.ownedProject(projectId, actor);
      },
      readReceipt: mapTaskProject,
      work: async () => {
        const { row, project: current } = await this.ownedProject(
          projectId,
          actor,
        );
        if (current.revision !== input.expectedRevision)
          throw new TaskManagerError(
            "REVISION_CONFLICT",
            "Проект изменён. Загрузите актуальную версию.",
            409,
          );
        if (
          current.title === input.title &&
          current.description === input.description &&
          JSON.stringify([...current.memberIds].sort()) ===
            JSON.stringify(memberIds)
        )
          return { result: current, projectId };
        const members = await this.participants.members(memberIds);
        const project = mapTaskProject({
          ...current,
          title: input.title,
          description: input.description,
          memberIds,
          revision: current.revision + 1,
          updatedAt: new Date().toISOString(),
        });
        // Relation и JSON membership обновляются вместе внутри общего project lock.
        await this.repository.update(TASK_PROJECTS_SLUG, row.id, {
          members,
          record: project,
        });
        return { result: project, projectId };
      },
    });
  }

  private async ownedProject(projectId: string, actor: TaskActor) {
    const result = await this.context.readProject(projectId, actor);
    if (result.project.ownerId !== actor.id)
      throw new TaskManagerError(
        "FORBIDDEN",
        "Изменять проект может только его владелец.",
        403,
      );
    return result;
  }
}
