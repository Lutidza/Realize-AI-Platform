/**
 * @file src/components/admin/task-manager/TaskManagerApi.adapter.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Обменивается строгими DTO с авторизованным API Task Manager.
 * @see documentation/specifications/task-management-execution.md
 */
import {
  taskEventSchema,
  taskListSchema,
  taskProjectSchema,
  taskSchema,
} from "@realize/payload-task-manager/contracts";
import type {
  TaskCreateInput,
  TaskProjectCreateInput,
  TaskUpdateInput,
} from "@realize/payload-task-manager/contracts";
import { z } from "zod";
import { TaskManagerClientError } from "./TaskManagerClient.error";
import type { TaskManagerTransport } from "./TaskManager.types";

const participantSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string(),
});
const pageSchema = <T>(item: z.ZodType<T>) =>
  z.strictObject({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
const errorSchema = z.strictObject({
  ok: z.literal(false),
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

/** Fetch dependency позволяет проверить transport без приложения и пользовательской БД. */
export class TaskManagerApi implements TaskManagerTransport {
  constructor(
    private readonly requestFetch: typeof fetch = (...args) => fetch(...args),
  ) {}

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    options?: RequestInit,
  ): Promise<T> {
    const response = await this.requestFetch(`/api/task-manager${path}`, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new TaskManagerClientError(
        "Не удалось подтвердить ответ сервера. Повторите запрос.",
        "invalid_response",
        response.status,
      );
    }
    const failure = errorSchema.safeParse(body);
    if (failure.success) {
      throw new TaskManagerClientError(
        failure.data.error.message,
        failure.data.error.code,
        response.status,
        failure.data.error.fieldErrors,
      );
    }
    const result = z
      .strictObject({ ok: z.literal(true), data: schema })
      .safeParse(body);
    if (!response.ok || !result.success) {
      throw new TaskManagerClientError(
        "Сервер вернул неподтверждённый ответ. Повторите запрос.",
        "invalid_response",
        response.status,
      );
    }
    return result.data.data;
  }

  private query(
    path: string,
    parameters: Record<string, string | null | undefined>,
  ): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(parameters))
      if (value) query.set(key, value);
    return `${path}${query.size ? `?${query}` : ""}`;
  }

  private mutation(input: unknown, key: string, method = "POST"): RequestInit {
    return {
      method,
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(input),
    };
  }

  projects(after?: string | null, signal?: AbortSignal) {
    return this.request(
      this.query("/projects", { after }),
      pageSchema(taskProjectSchema),
      { signal },
    );
  }
  lists(projectId: string, after?: string | null, signal?: AbortSignal) {
    return this.request(
      this.query("/lists", { projectId, after }),
      pageSchema(taskListSchema),
      { signal },
    );
  }
  participants(after?: string | null, signal?: AbortSignal) {
    return this.request(
      this.query("/participants", { after }),
      pageSchema(participantSchema),
      { signal },
    );
  }
  tasks(
    projectId: string,
    listId: string,
    after?: string | null,
    signal?: AbortSignal,
  ) {
    return this.request(
      this.query("/tasks", { projectId, listId, after }),
      pageSchema(taskSchema),
      { signal },
    );
  }
  task(id: string, signal?: AbortSignal) {
    return this.request(`/tasks/${encodeURIComponent(id)}`, taskSchema, {
      signal,
    });
  }
  events(id: string, after?: string | null, signal?: AbortSignal) {
    return this.request(
      this.query(`/tasks/${encodeURIComponent(id)}/events`, { after }),
      pageSchema(taskEventSchema),
      { signal },
    );
  }
  createProject(input: TaskProjectCreateInput, key: string) {
    return this.request(
      "/projects",
      taskProjectSchema,
      this.mutation(input, key),
    );
  }
  createTask(input: TaskCreateInput, key: string) {
    return this.request("/tasks", taskSchema, this.mutation(input, key));
  }
  updateTask(id: string, input: TaskUpdateInput, key: string) {
    return this.request(
      `/tasks/${encodeURIComponent(id)}`,
      taskSchema,
      this.mutation(input, key, "PATCH"),
    );
  }
}

export const taskManagerApi: TaskManagerTransport = new TaskManagerApi();
