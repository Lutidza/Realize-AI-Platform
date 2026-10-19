/**
 * @file packages/payload-task-manager/src/server/TaskGitSync.service.ts
 * @version 1.1.0
 * @date 2026-10-19
 * @description Сохраняет immutable Git sync с durable replay, сетью вне locks и свежей ACL/CAS при записи.
 * @see documentation/specifications/task-management-execution.md
 */
import { randomUUID } from "node:crypto";
import type { TaskDto, TaskPageDto } from "../contracts/TaskManager.types";
import type { TaskGitSyncDto } from "../contracts/TaskGitSync.types";
import { taskGitSyncInputSchema } from "../contracts/taskGitSync.schemas";
import { TASK_GIT_SYNCS_SLUG } from "../taskManager.constants";
import type { TaskGitSyncContext } from "./TaskGitSync.types";
import type { TaskActor } from "./TaskStorage.types";
import { TaskStoreRepository } from "./TaskStore.repository";
import { TaskManagerError } from "./TaskManager.error";
import { parseTaskCommand } from "./parseTaskCommand.validator";
import { createTaskMutationIdentity } from "./createTaskMutationIdentity.validator";
import { readTaskMutationReceipt } from "./readTaskMutationReceipt.service";
import { withTaskMutation } from "./withTaskMutation.service";
import {
  assertIndependentTaskTransaction,
  withTaskTransaction,
} from "./withTaskTransaction.repository";
import { readTaskGitObservations } from "./readTaskGitObservations.service";
import { mapTaskGitSync } from "./mapTaskGitSync.mapper";

/** Sync — отдельное досье фактов; статус, revision и task events остаются под owner задач. */
export class TaskGitSyncService {
  private readonly repository: TaskStoreRepository;
  constructor(private readonly context: TaskGitSyncContext) {
    this.repository = new TaskStoreRepository(context.req);
  }

  async sync(taskId: string, value: unknown): Promise<TaskGitSyncDto> {
    const { req } = this.context;
    await assertIndependentTaskTransaction(req);
    const actor = await this.context.authorize("write");
    const input = parseTaskCommand(taskGitSyncInputSchema, value);
    const initial = await this.context.readTask(taskId, actor);
    const operation = `sync-git:${taskId}`;
    const identity = createTaskMutationIdentity({
      req,
      actorId: actor.id,
      projectId: initial.projectId,
      operation,
      command: input,
    });
    const readReceipt = (receipt: unknown): TaskGitSyncDto => {
      const sync = mapTaskGitSync(receipt);
      if (
        sync.taskId !== initial.id ||
        sync.projectId !== initial.projectId ||
        sync.actorId !== actor.id ||
        sync.taskRevision !== input.expectedRevision
      )
        throw new TaskManagerError(
          "STORAGE_UNAVAILABLE",
          "Receipt относится к другой Git-команде.",
          503,
        );
      return sync;
    };
    // Locks дают согласованный preflight/replay; ни provider call, ни snapshot запись здесь не выполняются.
    const preflight = await withTaskTransaction(
      req,
      actor.id,
      initial.projectId,
      async () => {
        const current = await this.authorizedTask(taskId, actor);
        const previous = await readTaskMutationReceipt({
          req,
          identity,
          readReceipt,
        });
        if (previous.found)
          return { replay: true as const, result: previous.result };
        this.assertRevision(current, input.expectedRevision);
        return { replay: false as const, task: current };
      },
    );
    if (preflight.replay) return preflight.result;

    // Provider facts читаются только после отсутствия receipt и завершения preflight transaction.
    const snapshot = await readTaskGitObservations(
      req,
      preflight.task,
      this.context.options.observeGitBinding,
    );
    await assertIndependentTaskTransaction(req);
    return withTaskMutation({
      req,
      actorId: actor.id,
      projectId: initial.projectId,
      operation,
      command: input,
      authorize: async () => {
        await this.authorizedTask(taskId, actor);
      },
      readReceipt,
      work: async () => {
        const current = await this.authorizedTask(taskId, actor);
        this.assertRevision(current, input.expectedRevision);
        if (
          current.projectId !== preflight.task.projectId ||
          JSON.stringify(current.gitBindings) !==
            JSON.stringify(preflight.task.gitBindings)
        )
          throw new TaskManagerError(
            "REVISION_CONFLICT",
            "Привязки задачи изменены во время чтения Git.",
            409,
          );
        const sync = mapTaskGitSync({
          id: randomUUID(),
          projectId: current.projectId,
          actorId: actor.id,
          taskId: snapshot.taskId,
          taskRevision: snapshot.taskRevision,
          observedAt: snapshot.observedAt,
          recordedAt: new Date().toISOString(),
          complete: snapshot.complete,
          items: snapshot.items,
        });
        await this.repository.create(TASK_GIT_SYNCS_SLUG, {
          syncId: sync.id,
          taskId: sync.taskId,
          projectId: sync.projectId,
          taskRevision: sync.taskRevision,
          actorId: sync.actorId,
          record: sync,
        });
        return { result: sync, projectId: sync.projectId };
      },
    });
  }

  /** История newest-first проверяет текущий ACL; cursor связан с actor, task/project и направлением. */
  async history(
    taskId: string,
    after: string | null,
  ): Promise<TaskPageDto<TaskGitSyncDto>> {
    await assertIndependentTaskTransaction(this.context.req);
    const actor = await this.context.authorize();
    const task = await this.context.readTask(taskId, actor);
    const page = await this.repository.page(
      TASK_GIT_SYNCS_SLUG,
      {
        and: [
          { taskId: { equals: task.id } },
          { projectId: { equals: task.projectId } },
        ],
      },
      after,
      "desc",
    );
    await this.authorizedTask(taskId, actor, "read");
    return {
      items: page.rows.map((row) => {
        const sync = mapTaskGitSync(row.record);
        if (sync.taskId !== task.id || sync.projectId !== task.projectId)
          throw new TaskManagerError(
            "STORAGE_UNAVAILABLE",
            "Git-снимок относится к другой задаче.",
            503,
          );
        return sync;
      }),
      nextCursor: page.nextCursor,
    };
  }

  private async authorizedTask(
    taskId: string,
    actor: TaskActor,
    permission: "read" | "write" = "write",
  ): Promise<TaskDto> {
    const currentActor = await this.context.authorize(permission);
    if (currentActor.id !== actor.id)
      throw new TaskManagerError(
        "FORBIDDEN",
        "Автор запроса изменился. Повторите запрос.",
        403,
      );
    return this.context.readTask(taskId, currentActor);
  }

  private assertRevision(task: TaskDto, expectedRevision: number): void {
    if (task.revision !== expectedRevision)
      throw new TaskManagerError(
        "REVISION_CONFLICT",
        "Задача изменена другим участником. Загрузите актуальную версию.",
        409,
      );
  }
}
