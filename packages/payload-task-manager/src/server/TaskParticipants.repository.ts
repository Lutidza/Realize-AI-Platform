/**
 * @file packages/payload-task-manager/src/server/TaskParticipants.repository.ts
 * @version 1.0.1
 * @date 2026-10-19
 * @description Читает допустимых реальных участников через host users ACL без email и auth-полей.
 * @see documentation/specifications/task-management-execution.md
 */
import type {
  CollectionSlug,
  PayloadRequest,
  TypedCollectionSelect,
} from "payload";
import type {
  TaskPageDto,
  TaskParticipantDto,
} from "../contracts/TaskManager.types";
import type { ResolvedTaskManagerOptions } from "../TaskManagerOptions.types";
import { TASK_PAGE_SIZE } from "../taskManager.constants";
import { TaskManagerError } from "./TaskManager.error";
import { createTaskCursor, readTaskCursor } from "./taskCursor.adapter";
import { validateTaskParticipantIds } from "./validateTaskParticipantIds.validator";

export class TaskParticipantsRepository {
  constructor(
    private readonly req: PayloadRequest,
    private readonly options: ResolvedTaskManagerOptions,
  ) {}

  async members(ids: string[]): Promise<Array<string | number>> {
    validateTaskParticipantIds(this.req, this.options.userCollection, ids);
    const filter = await this.options.participantWhere({ req: this.req });
    const found = await this.req.payload.find({
      collection: this.options.userCollection,
      where: { and: [filter, { id: { in: ids } }] },
      limit: ids.length,
      pagination: false,
      depth: 0,
      select: {
        [this.options.participantLabelField]: true,
      } as TypedCollectionSelect[CollectionSlug],
      overrideAccess: false,
      req: this.req,
    });
    if (found.docs.length !== ids.length)
      throw new TaskManagerError(
        "INVALID_REQUEST",
        "Участник недоступен или не допускается в проект.",
        422,
        { memberIds: ["Выберите доступных участников."] },
      );
    return found.docs.map((user) => user.id);
  }

  async page(after: string | null): Promise<TaskPageDto<TaskParticipantDto>> {
    const filter = await this.options.participantWhere({ req: this.req });
    const scope = JSON.stringify([
      String(this.req.user?.id),
      "participants",
      filter,
    ]);
    const cursor = readTaskCursor(this.req.payload.secret, scope, after);
    const result = await this.req.payload.find({
      collection: this.options.userCollection,
      where: {
        and: [filter, ...(cursor ? [{ id: { greater_than: cursor } }] : [])],
      },
      limit: TASK_PAGE_SIZE + 1,
      depth: 0,
      sort: "id",
      select: {
        [this.options.participantLabelField]: true,
      } as TypedCollectionSelect[CollectionSlug],
      overrideAccess: false,
      req: this.req,
    });
    const users = result.docs as unknown as Array<
      Record<string, unknown> & { id: string | number }
    >;
    return {
      items: users.slice(0, TASK_PAGE_SIZE).map((user) => ({
        id: String(user.id),
        name:
          typeof user[this.options.participantLabelField] === "string" &&
          String(user[this.options.participantLabelField]).trim()
            ? String(user[this.options.participantLabelField]).slice(0, 200)
            : `Участник ${user.id}`,
      })),
      nextCursor:
        users.length > TASK_PAGE_SIZE
          ? createTaskCursor(
              this.req.payload.secret,
              scope,
              users[TASK_PAGE_SIZE - 1].id,
            )
          : null,
    };
  }
}
