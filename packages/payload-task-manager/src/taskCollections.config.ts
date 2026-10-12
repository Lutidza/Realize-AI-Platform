/**
 * @file packages/payload-task-manager/src/taskCollections.config.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Регистрирует закрытые задачи, membership проектов и неизменяемую историю операций.
 * @see documentation/specifications/task-management-execution.md
 */
import type { CollectionConfig, Field } from "payload";
import type { ResolvedTaskManagerOptions } from "./TaskManagerOptions.types";
import {
  TASK_EVENTS_SLUG,
  TASK_LISTS_SLUG,
  TASK_OPERATIONS_SLUG,
  TASK_PROJECTS_SLUG,
  TASKS_SLUG,
  TASK_GIT_SYNCS_SLUG,
} from "./taskManager.constants";

const text = (
  name: string,
  options: { unique?: boolean; index?: boolean } = {},
): Field => ({ name, type: "text", required: true, ...options });
const json = (name: string): Field => ({ name, type: "json", required: true });
const deny = () => false;

/** Generic REST/GraphQL CRUD закрыт: доступ и атомарность принадлежат task facade. */
export function createTaskCollections(
  options: ResolvedTaskManagerOptions,
): CollectionConfig[] {
  const definitions: Array<{
    slug: string;
    fields: Field[];
    immutable?: boolean;
  }> = [
    {
      slug: TASK_PROJECTS_SLUG,
      fields: [
        text("projectId", { unique: true }),
        text("ownerId", { index: true }),
        {
          name: "members",
          type: "relationship",
          relationTo: options.userCollection,
          hasMany: true,
          required: true,
          index: true,
        },
        json("record"),
      ],
    },
    {
      slug: TASK_LISTS_SLUG,
      fields: [
        text("listId", { unique: true }),
        text("projectId", { index: true }),
        json("record"),
      ],
    },
    {
      slug: TASKS_SLUG,
      fields: [
        text("taskId", { unique: true }),
        text("projectId", { index: true }),
        text("listId", { index: true }),
        { name: "revision", type: "number", required: true, min: 1 },
        json("record"),
      ],
    },
    {
      slug: TASK_EVENTS_SLUG,
      immutable: true,
      fields: [
        text("eventId", { unique: true }),
        text("projectId", { index: true }),
        text("taskId", { index: true }),
        text("actorId"),
        { name: "revision", type: "number", required: true, min: 1 },
        json("record"),
      ],
    },
    {
      slug: TASK_OPERATIONS_SLUG,
      immutable: true,
      fields: [
        text("replayKey", { unique: true }),
        text("requestHash"),
        text("actorId"),
        text("projectId", { index: true }),
        json("receipt"),
      ],
    },
    {
      slug: TASK_GIT_SYNCS_SLUG,
      immutable: true,
      fields: [
        text("syncId", { unique: true }),
        text("taskId", { index: true }),
        text("projectId", { index: true }),
        {
          name: "taskRevision",
          type: "number",
          required: true,
          min: 1,
          index: true,
        },
        text("actorId", { index: true }),
        json("record"),
      ],
    },
  ];
  return definitions.map(({ slug, fields, immutable }) => ({
    slug,
    fields,
    access: { create: deny, read: deny, update: deny, delete: deny },
    admin: { hidden: true, group: "Task Manager" },
    versions: false,
    lockDocuments: false,
    timestamps: true,
    ...(immutable
      ? {
          hooks: {
            beforeChange: [
              ({ operation }) => {
                if (operation !== "create")
                  throw new Error("TASK_HISTORY_IMMUTABLE");
              },
            ],
            beforeDelete: [
              () => {
                throw new Error("TASK_HISTORY_IMMUTABLE");
              },
            ],
          },
        }
      : {}),
  }));
}
