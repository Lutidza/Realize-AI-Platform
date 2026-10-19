/**
 * @file tests/int/access-management-task-scopes.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Проверяет переносимый scope port Task Manager до чтения user и внутри mutation locks/replay.
 * @see documentation/architecture/platform-access.md
 */
// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { accessFixture } from "./access-management.fixture";
import { TaskManagerService } from "../../packages/payload-task-manager/src/server/TaskManager.service";
import { TaskManagerError } from "../../packages/payload-task-manager/src/server/TaskManager.error";
import { resolveTaskManagerOptions } from "../../packages/payload-task-manager/src/taskManagerOptions.config";
import { TASK_PROJECTS_SLUG } from "../../packages/payload-task-manager/src/taskManager.constants";
import type { TaskManagerPermission } from "../../packages/payload-task-manager/src/TaskManagerOptions.types";

describe("Task Manager endpoint-local permission port", () => {
  it("binds the real user through the optional port before existing admission", async () => {
    const fixture = accessFixture();
    const req = fixture.request("/api/task-manager/projects", {}, null);
    const authorizeRequest = vi.fn(
      async ({
        req: request,
        permission,
      }: {
        req: typeof req;
        permission: TaskManagerPermission;
      }) => {
        expect(permission).toBe("read");
        request.user = { id: 1, collection: "users" } as typeof request.user;
      },
    );
    const options = resolveTaskManagerOptions({
      userCollection: "users",
      canUseTaskManager: () => true,
      participantWhere: () => ({}),
      authorizeRequest,
    });
    expect(await new TaskManagerService(req, options).projects()).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(authorizeRequest).toHaveBeenCalledOnce();
    const denied = new TaskManagerService(req, {
      ...options,
      canUseTaskManager: () => false,
    });
    await expect(denied.projects()).rejects.toMatchObject({ status: 403 });
  });
  it("requires write for every task/list/sync mutation and projects for membership management", async () => {
    const fixture = accessFixture();
    const permissions: TaskManagerPermission[] = [];
    const options = resolveTaskManagerOptions({
      userCollection: "users",
      canUseTaskManager: () => true,
      participantWhere: () => ({}),
      authorizeRequest: ({ permission }) => {
        permissions.push(permission);
        if (permission !== "read")
          throw new TaskManagerError("FORBIDDEN", "Scope denied.", 403);
      },
    });
    const service = new TaskManagerService(fixture.request(), options);
    const id = randomUUID();
    const operations = [
      () => service.createTask({}),
      () => service.createTaskFromWorkspace({}),
      () => service.updateTask(id, {}),
      () => service.createList({}),
      () => service.updateList(id, {}),
      () => service.syncGit(id, {}),
      () => service.createProject({}),
      () => service.updateProject(id, {}),
    ];
    for (const operation of operations)
      await expect(operation()).rejects.toMatchObject({ status: 403 });
    expect(permissions).toEqual([
      "write",
      "write",
      "write",
      "write",
      "write",
      "write",
      "projects",
      "projects",
    ]);
    expect(fixture.payload.create).not.toHaveBeenCalled();
    expect(fixture.payload.db.beginTransaction).not.toHaveBeenCalled();
  });
  it("rechecks project scope under lock before writes and before durable replay", async () => {
    const fixture = accessFixture();
    const req = fixture.request("/api/task-manager/projects", {
      headers: { "Idempotency-Key": randomUUID() },
    });
    const checked: {
      permission: TaskManagerPermission;
      inTransaction: boolean;
    }[] = [];
    let denyInside = false;
    const options = resolveTaskManagerOptions({
      userCollection: "users",
      canUseTaskManager: () => true,
      participantWhere: () => ({}),
      authorizeRequest: async ({ permission, req }) => {
        const inTransaction = (await req.transactionID) != null;
        checked.push({ permission, inTransaction });
        if (denyInside && inTransaction)
          throw new TaskManagerError("FORBIDDEN", "Access revoked.", 403);
      },
    });
    const service = new TaskManagerService(req, options);
    const command = { title: "Первый проект", description: "", memberIds: [] };
    const created = await service.createProject(command);
    expect(created.ownerId).toBe("1");
    expect(checked).toEqual([
      { permission: "projects", inTransaction: false },
      { permission: "projects", inTransaction: true },
    ]);
    denyInside = true;
    await expect(service.createProject(command)).rejects.toMatchObject({
      status: 403,
    });
    expect(fixture.rows.get(TASK_PROJECTS_SLUG)).toHaveLength(1);
    expect(fixture.payload.db.rollbackTransaction).toHaveBeenCalledOnce();
    expect(checked.at(-1)).toEqual({
      permission: "projects",
      inTransaction: true,
    });
  });
  it("preserves prior cookie/JWT behavior when no host port is configured", async () => {
    const fixture = accessFixture();
    const options = resolveTaskManagerOptions({
      userCollection: "users",
      canUseTaskManager: () => true,
      participantWhere: () => ({}),
    });
    expect(
      await new TaskManagerService(fixture.request(), options).authorize(),
    ).toEqual({ id: "1", payloadId: 1 });
    await expect(
      new TaskManagerService(
        fixture.request("/api/task-manager", {}, null),
        options,
      ).projects(),
    ).rejects.toMatchObject({ status: 401 });
  });
});
