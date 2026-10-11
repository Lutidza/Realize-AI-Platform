/**
 * @file packages/payload-task-manager/src/server/taskManagerEndpoints.controller.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Адаптирует authenticated Task HTTP к серверному facade с безопасными envelopes.
 * @see documentation/specifications/task-management-execution.md
 */
import type { Endpoint, PayloadRequest } from "payload";
import { z } from "zod";
import type { ResolvedTaskManagerOptions } from "../TaskManagerOptions.types";
import { TaskManagerService } from "./TaskManager.service";
import { TaskManagerError } from "./TaskManager.error";
import { parseTaskCommand } from "./parseTaskCommand.validator";
import { readTaskBody } from "./readTaskBody.adapter";

const after = z.string().min(1).max(256).optional();
const pageQuery = z.strictObject({ after });
const listQuery = z.strictObject({ projectId: z.uuid(), after });
const taskQuery = z.strictObject({
  projectId: z.uuid(),
  listId: z.uuid(),
  after,
});
const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

function query<T>(req: PayloadRequest, schema: z.ZodType<T>): T {
  const params = new URL(req.url ?? "http://localhost").searchParams;
  for (const name of new Set(params.keys())) {
    if (params.getAll(name).length !== 1)
      throw new TaskManagerError(
        "INVALID_REQUEST",
        "Параметры запроса повторяются.",
        422,
      );
  }
  return parseTaskCommand(schema, Object.fromEntries(params));
}

/** Collection CRUD недоступен: HTTP обращается только к авторизованному task domain. */
export function createTaskEndpoints(
  options: ResolvedTaskManagerOptions,
): Endpoint[] {
  const endpoint = (
    path: string,
    method: "get" | "post" | "patch",
    work: (
      service: TaskManagerService,
      req: PayloadRequest,
    ) => Promise<unknown>,
  ): Endpoint => ({
    path: `${options.apiRoute}${path}`,
    method,
    handler: async (req) => {
      try {
        const service = new TaskManagerService(req, options);
        await service.authorize();
        return Response.json(
          { ok: true, data: await work(service, req) },
          { headers: responseHeaders },
        );
      } catch (error) {
        const safe =
          error instanceof TaskManagerError
            ? error
            : new TaskManagerError(
                "STORAGE_UNAVAILABLE",
                "Хранилище задач временно недоступно. Повторите сохранение с тем же ключом запроса.",
                503,
              );
        return Response.json(
          {
            ok: false,
            error: {
              code: safe.code,
              message: safe.message,
              ...(safe.fieldErrors ? { fieldErrors: safe.fieldErrors } : {}),
            },
          },
          { status: safe.status, headers: responseHeaders },
        );
      }
    },
  });
  const id = (req: PayloadRequest) => String(req.routeParams?.id ?? "");
  return [
    endpoint("/participants", "get", (service, req) =>
      service.participants(query(req, pageQuery).after ?? null),
    ),
    endpoint("/projects", "get", (service, req) =>
      service.projects(query(req, pageQuery).after ?? null),
    ),
    endpoint("/projects", "post", async (service, req) =>
      service.createProject(await readTaskBody(req)),
    ),
    endpoint("/lists", "get", (service, req) => {
      const input = query(req, listQuery);
      return service.lists(input.projectId, input.after ?? null);
    }),
    endpoint("/tasks", "get", (service, req) => {
      const input = query(req, taskQuery);
      return service.tasks(input.projectId, input.listId, input.after ?? null);
    }),
    endpoint("/tasks", "post", async (service, req) =>
      service.createTask(await readTaskBody(req)),
    ),
    endpoint("/tasks/:id", "get", (service, req) => service.task(id(req))),
    endpoint("/tasks/:id", "patch", async (service, req) =>
      service.updateTask(id(req), await readTaskBody(req)),
    ),
    endpoint("/tasks/:id/events", "get", (service, req) =>
      service.events(id(req), query(req, pageQuery).after ?? null),
    ),
  ];
}
