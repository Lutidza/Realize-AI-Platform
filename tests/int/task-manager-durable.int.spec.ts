/**
 * @file tests/int/task-manager-durable.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Проверяет строгий task API, admission, неподтверждённые Git-связи и scoped курсоры.
 * @see documentation/specifications/task-management-execution.md
 */
// @vitest-environment node
import { randomUUID } from "node:crypto";
import { postgresAdapter } from "@payloadcms/db-postgres";
import type { CollectionConfig, PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";
import {
  taskCreateSchema,
  taskProjectCreateSchema,
  taskUpdateSchema,
} from "../../packages/payload-task-manager/src/contracts/taskManager.schemas";
import {
  createTaskCursor,
  readTaskCursor,
} from "../../packages/payload-task-manager/src/server/taskCursor.adapter";
import { readTaskBody } from "../../packages/payload-task-manager/src/server/readTaskBody.adapter";
import { createTaskEndpoints } from "../../packages/payload-task-manager/src/server/taskManagerEndpoints.controller";
import { TaskManagerService } from "../../packages/payload-task-manager/src/server/TaskManager.service";
import { createTaskCollections } from "../../packages/payload-task-manager/src/taskCollections.config";
import { resolveTaskManagerOptions } from "../../packages/payload-task-manager/src/taskManagerOptions.config";
import { taskManagerPlugin } from "../../packages/payload-task-manager/src/taskManager.plugin";
import { TASK_REQUEST_BYTES } from "../../packages/payload-task-manager/src/taskManager.constants";

const options = resolveTaskManagerOptions({
  userCollection: "users",
  canUseTaskManager: async () => true,
  participantWhere: () => ({ roles: { contains: "admin" } }),
});
const command = () => ({
  projectId: randomUUID(),
  listId: randomUUID(),
  title: "Новая задача",
  description: "Требование",
  status: "backlog" as const,
  priority: "normal" as const,
  assigneeId: null,
  gitBindings: [
    {
      repositoryId: "platform",
      commitSha: "a".repeat(40),
      purpose: "platform-core" as const,
      source: "manual" as const,
      verification: "unverified" as const,
    },
  ],
});
function request(
  path = "/api/task-manager/projects",
  init?: RequestInit,
  user: unknown = { id: 1, collection: "users" },
) {
  const find = vi.fn().mockResolvedValue({ docs: [] });
  const req = Object.assign(new Request(`http://localhost${path}`, init), {
    user,
    payload: { find, secret: "test-only-cursor-secret" },
  }) as unknown as PayloadRequest;
  return { req, find };
}

describe("durable Task Manager boundaries", () => {
  it("rejects forged actors/revisions, unsupported completion and invalid commit identities", () => {
    const input = command();
    expect(taskCreateSchema.parse(input)).toEqual(input);
    for (const extra of [
      { createdBy: "attacker" },
      { revision: 500 },
      { status: "done" },
      { title: "   " },
      { description: "a".repeat(20001) },
    ])
      expect(taskCreateSchema.safeParse({ ...input, ...extra }).success).toBe(
        false,
      );
    for (const commitSha of [
      "abc1234",
      "A".repeat(40),
      "a".repeat(39),
      "g".repeat(40),
    ])
      expect(
        taskCreateSchema.safeParse({
          ...input,
          gitBindings: [{ ...input.gitBindings[0], commitSha }],
        }).success,
      ).toBe(false);
    expect(
      taskCreateSchema.safeParse({
        ...input,
        gitBindings: [{ ...input.gitBindings[0], verification: "verified" }],
      }).success,
    ).toBe(false);
    expect(
      taskCreateSchema.safeParse({
        ...input,
        gitBindings: [
          {
            ...input.gitBindings[0],
            repositoryId:
              "https://" +
              ["fixture-user", "fixture-password"].join(":") +
              "@github.com/repo",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      taskCreateSchema.safeParse({
        ...input,
        gitBindings: [input.gitBindings[0], input.gitBindings[0]],
      }).success,
    ).toBe(false);
    expect(
      taskCreateSchema.safeParse({
        ...input,
        gitBindings: [{ ...input.gitBindings[0], commitSha: "b".repeat(64) }],
      }).success,
    ).toBe(true);
  });

  it("requires a CAS revision and rejects changes to immutable project/list ownership", () => {
    const { projectId, listId, ...editable } = command();
    expect(taskUpdateSchema.safeParse(editable).success).toBe(false);
    expect(
      taskUpdateSchema.safeParse({ ...editable, expectedRevision: 1 }).success,
    ).toBe(true);
    expect(
      taskUpdateSchema.safeParse({
        ...editable,
        expectedRevision: 1,
        projectId,
        listId,
      }).success,
    ).toBe(false);
    expect(
      taskUpdateSchema.safeParse({ ...editable, expectedRevision: 0 }).success,
    ).toBe(false);
    expect(
      taskProjectCreateSchema.safeParse({
        title: "Проект",
        description: "",
        memberIds: ["1", "1"],
      }).success,
    ).toBe(false);
  });

  it("binds opaque cursors to their actor/query and rejects tampering", () => {
    const scope = JSON.stringify(["actor-1", "project-1", "tasks"]);
    const cursor = createTaskCursor("test-secret", scope, 125);
    expect(readTaskCursor("test-secret", scope, cursor)).toBe(125);
    expect(cursor).not.toBe("125");
    const userCursor = createTaskCursor(
      "test-secret",
      scope,
      "external-user-id",
    );
    expect(readTaskCursor("test-secret", scope, userCursor)).toBe(
      "external-user-id",
    );
    expect(() =>
      readTaskCursor("test-secret", "another-project", cursor),
    ).toThrow("другой области");
    expect(() => readTaskCursor("another-secret", scope, cursor)).toThrow(
      "другой области",
    );
    const changed = `${cursor.slice(0, 5)}${cursor[5] === "a" ? "b" : "a"}${cursor.slice(6)}`;
    expect(() => readTaskCursor("test-secret", scope, changed)).toThrow(
      "повреждён",
    );
    expect(() => readTaskCursor("test-secret", scope, "1")).toThrow("Курсор");
  });

  it("checks current admission before reading a body or querying storage", async () => {
    const { req, find } = request(
      "/api/task-manager/projects",
      { method: "POST", body: "not-json" },
      null,
    );
    const endpoint = createTaskEndpoints(options).find(
      (item) => item.method === "post" && item.path.endsWith("/projects"),
    )!;
    const response = (await endpoint.handler(req)) as Response;
    expect(response.status).toBe(401);
    expect(req.bodyUsed).toBe(false);
    expect(find).not.toHaveBeenCalled();
    const authenticated = request().req;
    await expect(
      new TaskManagerService(authenticated, {
        ...options,
        canUseTaskManager: () => false,
      }).projects(),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects externally owned transactions before task reads, validation or writes", async () => {
    const { req, find } = request();
    req.transactionID = "external-transaction";
    const service = new TaskManagerService(req, options);
    for (const mutation of [
      () => service.createProject({}),
      () => service.createTask({}),
      () => service.updateTask("unknown-task", {}),
    ])
      await expect(mutation()).rejects.toMatchObject({
        status: 503,
        code: "STORAGE_UNAVAILABLE",
      });
    expect(req.transactionID).toBe("external-transaction");
    expect(find).not.toHaveBeenCalled();
  });

  it("hides foreign projects and rejects duplicate/unknown query parameters", async () => {
    const { req, find } = request();
    const projectId = randomUUID();
    const now = new Date().toISOString();
    find.mockResolvedValue({
      docs: [
        {
          id: 1,
          record: {
            id: projectId,
            title: "Private",
            description: "",
            ownerId: "2",
            memberIds: ["2"],
            revision: 1,
            createdAt: now,
            updatedAt: now,
          },
        },
      ],
    });
    await expect(
      new TaskManagerService(req, options).lists(projectId),
    ).rejects.toMatchObject({ status: 404 });
    const endpoint = createTaskEndpoints(options).find(
      (item) => item.path.endsWith("/projects") && item.method === "get",
    )!;
    for (const path of [
      "/api/task-manager/projects?after=a&after=b",
      "/api/task-manager/projects?actorId=2",
    ]) {
      const sample = request(path);
      const response = (await endpoint.handler(sample.req)) as Response;
      expect(response.status).toBe(422);
      expect(sample.find).not.toHaveBeenCalled();
    }
  });

  it("bounds actual JSON bytes and rejects invalid UTF-8/content type", async () => {
    const valid = request("/api/task-manager/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Текст" }),
    }).req;
    await expect(readTaskBody(valid)).resolves.toEqual({ title: "Текст" });
    const tooLarge = request("/api/task-manager/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "1" },
      body: `"${"a".repeat(TASK_REQUEST_BYTES)}"`,
    }).req;
    await expect(readTaskBody(tooLarge)).rejects.toMatchObject({ status: 422 });
    const invalidUtf = request("/api/task-manager/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new Uint8Array([34, 255, 34]),
    }).req;
    await expect(readTaskBody(invalidUtf)).rejects.toMatchObject({
      status: 422,
    });
    const wrongType = request("/api/task-manager/tasks", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{}",
    }).req;
    await expect(readTaskBody(wrongType)).rejects.toMatchObject({
      status: 422,
    });
  });

  it("keeps generic CRUD closed and refuses host collection/endpoint collisions", async () => {
    for (const collection of createTaskCollections(options)) {
      for (const action of ["create", "read", "update", "delete"] as const)
        expect(
          await collection.access?.[action]?.({ req: request().req }),
        ).toBe(false);
    }
    const users = { slug: "users", fields: [] } as CollectionConfig;
    const db = postgresAdapter({
      pool: { connectionString: "postgresql://invalid.invalid/task-test" },
      push: false,
    });
    const plugin = taskManagerPlugin(options);
    await expect(async () =>
      plugin({
        secret: "test",
        db,
        collections: [users, { slug: "realize-tasks", fields: [] }],
      }),
    ).rejects.toThrow("collection collision");
    await expect(async () =>
      plugin({
        secret: "test",
        db,
        collections: [users],
        endpoints: [
          {
            method: "get",
            path: "/task-manager/projects",
            handler: async () => Response.json({}),
          },
        ],
      }),
    ).rejects.toThrow("endpoint collision");
    const config = await plugin({ secret: "test", db, collections: [users] });
    expect(config.collections).toHaveLength(6);
    expect(config.endpoints).toHaveLength(9);
  });
});
