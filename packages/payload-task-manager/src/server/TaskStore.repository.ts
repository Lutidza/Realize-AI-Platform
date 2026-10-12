/**
 * @file packages/payload-task-manager/src/server/TaskStore.repository.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Выполняет scoped Payload reads/writes и actor-bound пагинацию task storage.
 * @see documentation/specifications/task-management-execution.md
 */
import type {
  CollectionSlug,
  PayloadRequest,
  RequiredDataFromCollectionSlug,
  Where,
} from "payload";
import type {
  TaskStorageRow,
  TaskStorageSlug,
  TaskOperationRow,
  TaskPageDirection,
} from "./TaskStorage.types";
import { TASK_OPERATIONS_SLUG, TASK_PAGE_SIZE } from "../taskManager.constants";
import { createTaskCursor, readTaskCursor } from "./taskCursor.adapter";

/** Динамические slugs адаптируются только здесь; package не импортирует generated host types. */
export class TaskStoreRepository {
  constructor(private readonly req: PayloadRequest) {}

  async create(
    collection: TaskStorageSlug,
    fields: Record<string, unknown>,
  ): Promise<TaskStorageRow> {
    const result = await this.req.payload.create({
      collection: collection as CollectionSlug,
      data: fields as RequiredDataFromCollectionSlug<CollectionSlug>,
      depth: 0,
      overrideAccess: true,
      req: this.req,
    });
    return result as unknown as TaskStorageRow;
  }

  async update(
    collection: TaskStorageSlug,
    rowId: string | number,
    fields: Record<string, unknown>,
  ): Promise<void> {
    await this.req.payload.update({
      collection: collection as CollectionSlug,
      id: rowId,
      data: fields,
      depth: 0,
      overrideAccess: true,
      req: this.req,
    });
  }

  async findOne(
    collection: TaskStorageSlug,
    where: Where,
  ): Promise<TaskStorageRow | null> {
    const result = await this.req.payload.find({
      collection: collection as CollectionSlug,
      where,
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req: this.req,
    });
    return (result.docs[0] as unknown as TaskStorageRow | undefined) ?? null;
  }

  async page(
    collection: TaskStorageSlug,
    where: Where,
    after: string | null,
    direction: TaskPageDirection = "asc",
  ) {
    const scope = JSON.stringify([
      String(this.req.user?.id),
      collection,
      where,
      ...(direction === "desc" ? ["desc"] : []),
    ]);
    const cursor = readTaskCursor(this.req.payload.secret, scope, after);
    const result = await this.req.payload.find({
      collection: collection as CollectionSlug,
      where: {
        and: [
          where,
          ...(cursor
            ? [
                {
                  id:
                    direction === "asc"
                      ? { greater_than: cursor }
                      : { less_than: cursor },
                },
              ]
            : []),
        ],
      },
      limit: TASK_PAGE_SIZE + 1,
      depth: 0,
      sort: direction === "asc" ? "id" : "-id",
      overrideAccess: true,
      req: this.req,
    });
    const rows = result.docs as unknown as TaskStorageRow[];
    return {
      rows: rows.slice(0, TASK_PAGE_SIZE),
      nextCursor:
        rows.length > TASK_PAGE_SIZE
          ? createTaskCursor(
              this.req.payload.secret,
              scope,
              rows[TASK_PAGE_SIZE - 1].id,
            )
          : null,
    };
  }

  async replay(replayKey: string): Promise<TaskOperationRow | null> {
    const result = await this.req.payload.find({
      collection: TASK_OPERATIONS_SLUG as CollectionSlug,
      where: { replayKey: { equals: replayKey } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req: this.req,
    });
    return (result.docs[0] as unknown as TaskOperationRow | undefined) ?? null;
  }
}
