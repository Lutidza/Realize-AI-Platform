/**
 * @file tests/int/task-manager-projects-lists.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Проверяет строгие DTO и HTTP-границы управления проектами и списками.
 * @see documentation/specifications/task-management-execution.md
 */
// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { PayloadRequest } from "payload";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  taskListCreateSchema,
  taskListUpdateSchema,
  taskProjectUpdateSchema,
} from "@realize/payload-task-manager/contracts";
import { resolveTaskManagerOptions } from "../../packages/payload-task-manager/src/taskManagerOptions.config";
import { createTaskEndpoints } from "../../packages/payload-task-manager/src/server/taskManagerEndpoints.controller";
import { TaskManagerService } from "../../packages/payload-task-manager/src/server/TaskManager.service";
import { TaskParticipantsRepository } from "../../packages/payload-task-manager/src/server/TaskParticipants.repository";
import { TASK_LISTS_SLUG } from "../../packages/payload-task-manager/src/taskManager.constants";

const options = resolveTaskManagerOptions({
  userCollection: "users",
  canUseTaskManager: () => true,
  participantWhere: () => ({ roles: { contains: "admin" } }),
});
const projectId = randomUUID();
const listId = randomUUID();
const now = new Date().toISOString();
const project = {
  id: projectId,
  title: "Проект",
  description: "",
  ownerId: "1",
  memberIds: ["1", "2"],
  revision: 1,
  createdAt: now,
  updatedAt: now,
};
const list = {
  id: listId,
  projectId,
  title: "Список",
  revision: 1,
  createdAt: now,
  updatedAt: now,
};
const projectCommand = {
  title: "Проект",
  description: "",
  memberIds: ["2"],
  expectedRevision: 1,
};
const routes = [
  ["/projects/:id", "get"],
  ["/projects/:id", "patch"],
  ["/lists", "post"],
  ["/lists/:id", "get"],
  ["/lists/:id", "patch"],
] as const;

function request(
  path: string,
  method: string,
  body?: unknown,
  actor: number | null = 1,
) {
  const find = vi.fn(async ({ collection }) => ({
    docs: [
      {
        id: 999,
        privateStorageField: "must-not-leak",
        record: collection === TASK_LISTS_SLUG ? list : project,
      },
    ],
  }));
  const req = Object.assign(
    new Request(`http://localhost/api/task-manager${path}`, {
      method: method.toUpperCase(),
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
          }),
    }),
    {
      user: actor === null ? null : { id: actor, collection: "users" },
      routeParams: { id: path.startsWith("/projects") ? projectId : listId },
      payload: { find },
    },
  ) as unknown as PayloadRequest;
  return { req, find };
}

function endpoint(path: string, method: string) {
  return createTaskEndpoints(options).find(
    (item) => item.path === `/task-manager${path}` && item.method === method,
  )!;
}

afterEach(() => vi.restoreAllMocks());

describe("project/list management HTTP contracts", () => {
  it("validates numeric host IDs before querying and preserves custom string IDs and storage errors", async () => {
    const sample = request("/projects", "post");
    Object.assign(sample.req.payload, {
      collections: { users: {} },
      db: { defaultIDType: "number" },
    });
    const participants = new TaskParticipantsRepository(sample.req, options);
    for (const id of [
      "missing-user",
      "01",
      "1.5",
      "0",
      "2147483648",
      "9".repeat(100),
    ])
      await expect(participants.members([id])).rejects.toMatchObject({
        status: 422,
      });
    expect(sample.find).not.toHaveBeenCalled();
    sample.req.payload.collections.users.customIDType = "text";
    const memberFind = vi
      .fn()
      .mockResolvedValue({ docs: [{ id: "external-user" }] });
    sample.req.payload.find = memberFind;
    await expect(participants.members(["external-user"])).resolves.toEqual([
      "external-user",
    ]);
    const storageFailure = new Error("fixture database unavailable");
    memberFind.mockRejectedValueOnce(storageFailure);
    await expect(participants.members(["external-user"])).rejects.toBe(
      storageFailure,
    );
  });

  it("rejects immutable fields, unbounded membership and missing revisions", () => {
    expect(
      taskProjectUpdateSchema.parse({ ...projectCommand, title: "  Проект  " }),
    ).toEqual(projectCommand);
    for (const patch of [
      { ownerId: "2" },
      { id: projectId },
      { revision: 2 },
      { createdAt: now },
      { expectedRevision: undefined },
      { expectedRevision: 0 },
      { memberIds: ["2", "2"] },
      { memberIds: Array.from({ length: 102 }, (_, index) => String(index)) },
    ])
      expect(
        taskProjectUpdateSchema.safeParse({ ...projectCommand, ...patch })
          .success,
      ).toBe(false);
    expect(
      taskProjectUpdateSchema.safeParse({
        ...projectCommand,
        memberIds: Array.from({ length: 101 }, (_, index) => String(index)),
      }).success,
    ).toBe(true);
    expect(
      taskListCreateSchema.parse({ projectId, title: "  Новый  " }),
    ).toEqual({ projectId, title: "Новый" });
    for (const patch of [
      { id: listId },
      { revision: 1 },
      { projectId: "bad-id" },
      { title: " " },
    ])
      expect(
        taskListCreateSchema.safeParse({ projectId, title: "Новый", ...patch })
          .success,
      ).toBe(false);
    for (const patch of [
      { projectId },
      { id: listId },
      { expectedRevision: undefined },
      { expectedRevision: -1 },
    ])
      expect(
        taskListUpdateSchema.safeParse({
          title: "Новый",
          expectedRevision: 1,
          ...patch,
        }).success,
      ).toBe(false);
  });

  it("returns strict current DTOs to members and hides foreign project/list reads", async () => {
    for (const [path, expected] of [
      ["/projects/:id", project],
      ["/lists/:id", list],
    ] as const) {
      const response = (await endpoint(path, "get").handler(
        request(path, "get", undefined, 2).req,
      )) as Response;
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toEqual({ ok: true, data: expected });
      const foreign = (await endpoint(path, "get").handler(
        request(path, "get", undefined, 3).req,
      )) as Response;
      expect(foreign.status).toBe(404);
      expect(await foreign.json()).toMatchObject({
        ok: false,
        error: { code: "NOT_FOUND" },
      });
    }
  });

  it("checks admission before JSON/body or storage across all new routes", async () => {
    for (const [path, method] of routes) {
      const sample = request(
        path,
        method,
        method === "get" ? undefined : {},
        null,
      );
      const response = (await endpoint(path, method).handler(
        sample.req,
      )) as Response;
      expect(response.status).toBe(401);
      expect(sample.req.bodyUsed).toBe(false);
      expect(sample.find).not.toHaveBeenCalled();
    }
  });

  it("rejects query injection before consuming bodies or storage", async () => {
    for (const [path, method] of routes) {
      const sample = request(
        `${path}?actorId=2`,
        method,
        method === "get" ? undefined : {},
      );
      const response = (await endpoint(path, method).handler(
        sample.req,
      )) as Response;
      expect(response.status).toBe(422);
      expect(sample.req.bodyUsed).toBe(false);
      expect(sample.find).not.toHaveBeenCalled();
    }
  });

  it("requires mutation UUID keys and refuses non-owner project changes", async () => {
    const cases = [
      ["/projects/:id", "patch", projectCommand],
      ["/lists", "post", { projectId, title: "Новый" }],
      ["/lists/:id", "patch", { title: "Новый", expectedRevision: 1 }],
    ] as const;
    for (const [path, method, command] of cases) {
      const sample = request(path, method, command);
      const response = (await endpoint(path, method).handler(
        sample.req,
      )) as Response;
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: "INVALID_REQUEST" },
      });
    }
    await expect(
      new TaskManagerService(
        request("/projects/:id", "patch", projectCommand, 2).req,
        options,
      ).updateProject(projectId, projectCommand),
    ).rejects.toMatchObject({ status: 403 });
  });
});
