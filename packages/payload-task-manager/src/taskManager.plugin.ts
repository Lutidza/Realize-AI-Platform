/**
 * @file packages/payload-task-manager/src/taskManager.plugin.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Подключает постоянный Task domain к Payload без AI runtime и внутренних host импортов.
 * @see documentation/specifications/task-management-execution.md
 */
import type { Plugin } from "payload";
import type { TaskManagerOptions } from "./TaskManagerOptions.types";
import { TASK_COLLECTION_SLUGS } from "./taskManager.constants";
import { createTaskCollections } from "./taskCollections.config";
import { createTaskEndpoints } from "./server/taskManagerEndpoints.controller";
import { resolveTaskManagerOptions } from "./taskManagerOptions.config";

export type { TaskManagerOptions } from "./TaskManagerOptions.types";

/** Host сохраняет свои hooks, collections и endpoints; совпадение владельцев отклоняется. */
export function taskManagerPlugin(pluginOptions: TaskManagerOptions): Plugin {
  const options = resolveTaskManagerOptions(pluginOptions);
  return (config) => {
    const collections = config.collections ?? [];
    const collision = collections.find((collection) =>
      TASK_COLLECTION_SLUGS.some((slug) => slug === collection.slug),
    );
    if (collision)
      throw new Error(`Task Manager collection collision: ${collision.slug}`);
    if (
      !collections.some(
        (collection) => collection.slug === options.userCollection,
      )
    )
      throw new Error("Task Manager user collection is missing.");
    const endpoints = createTaskEndpoints(options);
    const conflicting = endpoints.find((endpoint) =>
      config.endpoints?.some(
        (existing) =>
          existing.path === endpoint.path &&
          existing.method === endpoint.method,
      ),
    );
    if (conflicting)
      throw new Error(
        `Task Manager endpoint collision: ${conflicting.method} ${conflicting.path}`,
      );
    return {
      ...config,
      collections: [...collections, ...createTaskCollections(options)],
      endpoints: [...(config.endpoints ?? []), ...endpoints],
    };
  };
}
