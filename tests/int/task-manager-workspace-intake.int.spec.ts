/**
 * @file tests/int/task-manager-workspace-intake.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Проверяет строгий workspace DTO, авторизацию до source lookup и возврат актуальной задачи.
 * @see documentation/specifications/task-management-execution.md
 */
// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";
import {
  taskWorkspaceCreateSchema,
  taskWorkspaceCreateResultSchema,
  type TaskDto,
  type TaskWorkspaceCreateInput,
} from "@realize/payload-task-manager/contracts";
import { TaskWorkspaceIntakeService } from "../../packages/payload-task-manager/src/server/TaskWorkspaceIntake.service";
import { TaskManagerError } from "../../packages/payload-task-manager/src/server/TaskManager.error";
import type { TaskWorkspaceSource } from "../../packages/payload-task-manager/src/server/TaskWorkspaceIntake.types";
import { createTaskEndpoints } from "../../packages/payload-task-manager/src/server/taskManagerEndpoints.controller";
import { resolveTaskManagerOptions } from "../../packages/payload-task-manager/src/taskManagerOptions.config";

vi.mock(
  "../../packages/payload-task-manager/src/server/withTaskTransaction.repository",
  () => ({
    withTaskTransaction: async (
      _req: unknown,
      _actor: string,
      _project: string,
      work: () => Promise<unknown>,
    ) => work(),
  }),
);

function fixture() {
  const input: TaskWorkspaceCreateInput = {
    clientTaskId: randomUUID(),
    projectId: randomUUID(),
    listId: randomUUID(),
    title: "Workspace task",
    description: "Исходные критерии задачи",
    status: "backlog",
    priority: "normal",
    assigneeId: null,
    gitBindings: [],
  };
  const { clientTaskId: _source, ...editable } = input;
  const task: TaskDto = {
    ...editable,
    id: randomUUID(),
    key: "TASK-42",
    revision: 1,
    createdBy: "1",
    updatedBy: "1",
    createdAt: "2026-10-19T00:00:00.000Z",
    updatedAt: "2026-10-19T00:00:00.000Z",
  };
  let stored: ({ record: TaskDto } & TaskWorkspaceSource) | undefined;
  const find = vi.fn(async () => ({ docs: stored ? [stored] : [] }));
  const req = { payload: { find } } as unknown as PayloadRequest;
  const authorize = vi.fn(async () => ({ id: "1", payloadId: 1 }));
  const authorizeProject = vi.fn(async () => undefined);
  const createTask = vi.fn(
    async (_input, _actor, source: TaskWorkspaceSource) => {
      stored = { record: task, ...source };
      return task;
    },
  );
  const service = new TaskWorkspaceIntakeService({
    req,
    authorize,
    authorizeProject,
    createTask,
  });
  return {
    input,
    task,
    service,
    find,
    authorize,
    authorizeProject,
    createTask,
  };
}

describe("workspace intake boundaries", () => {
  it("accepts only the create DTO and UUID, without actor or local lifecycle metadata", () => {
    const { input } = fixture();
    expect(
      taskWorkspaceCreateSchema.parse({
        ...input,
        clientTaskId: input.clientTaskId.toUpperCase(),
      }).clientTaskId,
    ).toBe(input.clientTaskId);
    for (const extra of [
      { clientTaskId: "local-slug" },
      { createdBy: "forged" },
      { expectedRevision: 1 },
      { workspaceCreateHash: "a".repeat(64) },
      { acceptance: { state: "accepted" } },
      { status: "done" },
    ])
      expect(
        taskWorkspaceCreateSchema.safeParse({ ...input, ...extra }).success,
      ).toBe(false);
    const { clientTaskId: _source, ...missing } = input;
    expect(taskWorkspaceCreateSchema.safeParse(missing).success).toBe(false);
  });

  it("normalizes the original command, then returns current task without another write", async () => {
    const fixtureValue = fixture();
    const { input, service, task, createTask, find } = fixtureValue;
    const first = await service.create({
      ...input,
      title: `  ${input.title}  `,
    });
    expect(taskWorkspaceCreateResultSchema.parse(first)).toEqual({
      task,
      disposition: "created",
    });
    task.title = "Edited remotely";
    task.revision = 4;
    const reordered = Object.fromEntries(Object.entries(input).reverse());
    expect(await service.create(reordered)).toEqual({
      task,
      disposition: "existing",
    });
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledTimes(2);
    expect(
      taskWorkspaceCreateResultSchema.safeParse({
        ...first,
        workspaceSourceId: input.clientTaskId,
      }).success,
    ).toBe(false);
  });

  it("authorizes the project before looking up an existing source", async () => {
    const { input, service, authorizeProject, find, createTask } = fixture();
    authorizeProject.mockRejectedValueOnce(
      new TaskManagerError("NOT_FOUND", "Проект не найден.", 404),
    );
    await expect(service.create(input)).rejects.toMatchObject({ status: 404 });
    expect(find).not.toHaveBeenCalled();
    expect(createTask).not.toHaveBeenCalled();
  });

  it("rejects changed source commands without returning task data", async () => {
    const { input, service, createTask } = fixture();
    await service.create(input);
    for (const changed of [
      { title: "Different" },
      { projectId: randomUUID() },
      { listId: randomUUID() },
    ])
      await expect(
        service.create({ ...input, ...changed }),
      ).rejects.toMatchObject({
        code: "WORKSPACE_SOURCE_CONFLICT",
        status: 409,
      });
    expect(createTask).toHaveBeenCalledTimes(1);
  });

  it("registers a dedicated endpoint and rejects unauthenticated HTTP before reading the body", async () => {
    const options = resolveTaskManagerOptions({
      userCollection: "users",
      canUseTaskManager: async () => true,
      participantWhere: () => ({}),
    });
    const endpoint = createTaskEndpoints(options).find(
      (item) =>
        item.path === "/task-manager/tasks/from-workspace" &&
        item.method === "post",
    )!;
    expect(endpoint).toBeDefined();
    const req = Object.assign(
      new Request("http://localhost/api/task-manager/tasks/from-workspace", {
        method: "POST",
        body: "invalid",
      }),
      { payload: {}, user: null },
    ) as unknown as PayloadRequest;
    const response = await endpoint.handler(req);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    expect(req.bodyUsed).toBe(false);
  });
});
