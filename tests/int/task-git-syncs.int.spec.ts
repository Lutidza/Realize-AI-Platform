/**
 * @file tests/int/task-git-syncs.int.spec.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Проверяет durable replay до сети, rollback sync/receipt, свежую ACL/CAS и descending history cursors.
 * @see documentation/specifications/task-management-execution.md
 */
// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { PayloadRequest, Where } from "payload";
import { describe, expect, it, vi } from "vitest";
import type {
  TaskDto,
  TaskGitBinding,
  TaskProjectDto,
} from "../../packages/payload-task-manager/src/contracts/TaskManager.types";
import type { TaskGitObservationProviderResult } from "../../packages/payload-task-manager/src/contracts/TaskGitObservation.types";
import type { TaskGitSyncDto } from "../../packages/payload-task-manager/src/contracts/TaskGitSync.types";
import {
  taskGitSyncInputSchema,
  taskGitSyncSchema,
} from "../../packages/payload-task-manager/src/contracts/taskGitSync.schemas";
import { taskGitObservationProviderResultSchema } from "../../packages/payload-task-manager/src/contracts/taskGitObservation.schemas";
import type { TaskGitBindingObserver } from "../../packages/payload-task-manager/src/TaskManagerOptions.types";
import { TaskManagerService } from "../../packages/payload-task-manager/src/server/TaskManager.service";
import { TaskStoreRepository } from "../../packages/payload-task-manager/src/server/TaskStore.repository";
import { createTaskEndpoints } from "../../packages/payload-task-manager/src/server/taskManagerEndpoints.controller";
import { resolveTaskManagerOptions } from "../../packages/payload-task-manager/src/taskManagerOptions.config";
import {
  TASK_GIT_SYNCS_SLUG,
  TASK_OPERATIONS_SLUG,
  TASK_PROJECTS_SLUG,
  TASKS_SLUG,
} from "../../packages/payload-task-manager/src/taskManager.constants";

function observed(
  binding: TaskGitBinding,
): Extract<TaskGitObservationProviderResult, { status: "observed" }> {
  const url = `https://github.com/${binding.repositoryId}`;
  return {
    status: "observed",
    repository: { id: "123", fullName: binding.repositoryId, url },
    commit: {
      sha: binding.commitSha,
      url: `${url}/commit/${binding.commitSha}`,
    },
    pullRequests: [
      {
        number: 1,
        url: `${url}/pull/1`,
        state: "open",
        draft: false,
        merged: false,
      },
    ],
    pullRequestsComplete: true,
    ci: {
      checkRuns: {
        status: "observed",
        totalCount: 1,
        complete: true,
        items: [
          {
            id: "17",
            name: "build",
            headSha: binding.commitSha,
            status: "completed",
            conclusion: "success",
            url: `${url}/runs/17`,
          },
        ],
      },
      commitStatuses: {
        status: "observed",
        totalCount: 1,
        complete: true,
        combinedState: "success",
        items: [{ id: "18", context: "lint", state: "success" }],
      },
    },
  };
}

function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === "and")
      return (condition as Where[]).every((part) => matches(row, part));
    const rule = condition as {
      equals?: unknown;
      less_than?: number;
      greater_than?: number;
    };
    if (rule.equals !== undefined) return row[field] === rule.equals;
    if (rule.less_than !== undefined)
      return Number(row[field]) < rule.less_than;
    if (rule.greater_than !== undefined)
      return Number(row[field]) > rule.greater_than;
    return true;
  });
}

function fixture() {
  const now = new Date().toISOString();
  const project: TaskProjectDto = {
    id: randomUUID(),
    title: "Project",
    description: "",
    ownerId: "1",
    memberIds: ["1", "2"],
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  const taskRow = { id: 58, taskId: randomUUID() };
  const task: TaskDto = {
    id: taskRow.taskId,
    projectId: project.id,
    listId: randomUUID(),
    key: `TASK-${taskRow.id}`,
    title: "Task",
    description: "",
    status: "review",
    priority: "normal",
    assigneeId: null,
    revision: 1,
    createdBy: "1",
    updatedBy: "1",
    createdAt: now,
    updatedAt: now,
    gitBindings: [
      {
        repositoryId: "fixture-owner/platform",
        commitSha: "a".repeat(40),
        purpose: "platform-core",
        source: "manual",
        verification: "unverified",
      },
    ],
  };
  const state = {
    task,
    project,
    admitted: true,
    failReceipt: false,
    syncs: [] as Array<Record<string, unknown>>,
    receipts: [] as Array<Record<string, unknown>>,
  };
  const transactions = new Map<
    string,
    {
      syncs: Array<Record<string, unknown>>;
      receipts: Array<Record<string, unknown>>;
    }
  >();
  const sessions: Record<
    string,
    { db: { execute: ReturnType<typeof vi.fn> } }
  > = {};
  const transactionLog: string[] = [];
  const db = {
    name: "postgres",
    sessions,
    beginTransaction: vi.fn(async () => {
      const id = randomUUID();
      transactions.set(id, {
        syncs: structuredClone(state.syncs),
        receipts: structuredClone(state.receipts),
      });
      sessions[id] = { db: { execute: vi.fn(async () => undefined) } };
      transactionLog.push("begin");
      return id;
    }),
    commitTransaction: vi.fn(async (id: string) => {
      const current = transactions.get(id)!;
      state.syncs = current.syncs;
      state.receipts = current.receipts;
      transactions.delete(id);
      delete sessions[id];
      transactionLog.push("commit");
    }),
    rollbackTransaction: vi.fn(async (id: string) => {
      transactions.delete(id);
      delete sessions[id];
      transactionLog.push("rollback");
    }),
  };
  let rowId = 0;
  const storage = (req: PayloadRequest) =>
    req.transactionID ? transactions.get(String(req.transactionID))! : state;
  const find = vi.fn(
    async ({
      collection,
      req,
      where,
      sort,
      limit = 1,
    }: {
      collection: string;
      req: PayloadRequest;
      where: Where;
      sort?: string;
      limit?: number;
    }) => {
      const current = storage(req);
      const rows =
        collection === TASKS_SLUG
          ? [{ ...taskRow, record: state.task }]
          : collection === TASK_PROJECTS_SLUG
            ? [{ id: 1, projectId: state.project.id, record: state.project }]
            : collection === TASK_OPERATIONS_SLUG
              ? current.receipts
              : current.syncs;
      return {
        docs: rows
          .filter((row) => matches(row, where))
          .sort(
            (a, b) => (Number(a.id) - Number(b.id)) * (sort === "-id" ? -1 : 1),
          )
          .slice(0, limit),
      };
    },
  );
  const create = vi.fn(
    async ({
      collection,
      req,
      data,
    }: {
      collection: string;
      req: PayloadRequest;
      data: Record<string, unknown>;
    }) => {
      if (collection === TASK_OPERATIONS_SLUG && state.failReceipt)
        throw new Error("fixture_receipt_failure");
      const row = { id: ++rowId, ...structuredClone(data) };
      const current = storage(req);
      (collection === TASK_GIT_SYNCS_SLUG
        ? current.syncs
        : current.receipts
      ).push(row);
      return row;
    },
  );
  const update = vi.fn();
  const req = Object.assign(
    new Request("http://localhost/api/task-manager/tasks", {
      headers: {
        "Idempotency-Key": randomUUID(),
        "Content-Type": "application/json",
      },
    }),
    {
      user: { id: 1, collection: "users" },
      payload: {
        db,
        find,
        create,
        update,
        secret: "fixture-only-cursor-secret",
      },
    },
  ) as unknown as PayloadRequest;
  const port = vi.fn(
    async ({ binding }: Parameters<TaskGitBindingObserver>[0]) => {
      expect(req.transactionID).toBeUndefined();
      transactionLog.push("provider");
      return observed(binding);
    },
  );
  const options = resolveTaskManagerOptions({
    userCollection: "users",
    canUseTaskManager: async () => state.admitted,
    participantWhere: () => ({}),
    observeGitBinding: port,
  });
  const service = new TaskManagerService(req, options);
  return {
    state,
    req,
    options,
    service,
    port,
    find,
    create,
    update,
    db,
    transactionLog,
  };
}

describe("durable task Git sync", () => {
  it("commits an immutable snapshot/receipt after network and never updates the task or its events", async () => {
    const sample = fixture();
    const before = JSON.stringify(sample.state.task);
    const sync = await sample.service.syncGit(sample.state.task.id, {
      expectedRevision: 1,
    });
    expect(taskGitSyncSchema.safeParse(sync).success).toBe(true);
    expect(sync).toMatchObject({
      taskId: sample.state.task.id,
      taskRevision: 1,
      projectId: sample.state.project.id,
      actorId: "1",
    });
    expect(sample.transactionLog).toEqual([
      "begin",
      "commit",
      "provider",
      "begin",
      "commit",
    ]);
    expect(sample.state.syncs).toHaveLength(1);
    expect(sample.state.receipts).toHaveLength(1);
    expect(JSON.stringify(sample.state.task)).toBe(before);
    expect(sample.update).not.toHaveBeenCalled();
    expect(sample.create.mock.calls.map(([args]) => args.collection)).toEqual([
      TASK_GIT_SYNCS_SLUG,
      TASK_OPERATIONS_SLUG,
    ]);
  });

  it("replays the exact receipt before provider even after task revision moves", async () => {
    const sample = fixture();
    const first = await sample.service.syncGit(sample.state.task.id, {
      expectedRevision: 1,
    });
    sample.state.task.revision = 2;
    expect(
      await sample.service.syncGit(sample.state.task.id, {
        expectedRevision: 1,
      }),
    ).toEqual(first);
    expect(sample.port).toHaveBeenCalledTimes(1);
    expect(sample.state.syncs).toHaveLength(1);
    await expect(
      sample.service.syncGit(sample.state.task.id, { expectedRevision: 2 }),
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    expect(sample.port).toHaveBeenCalledTimes(1);
  });

  it("rolls back a snapshot when receipt creation fails and retries the same key without duplicates", async () => {
    const sample = fixture();
    sample.state.failReceipt = true;
    await expect(
      sample.service.syncGit(sample.state.task.id, { expectedRevision: 1 }),
    ).rejects.toThrow("fixture_receipt_failure");
    expect(sample.state.syncs).toHaveLength(0);
    expect(sample.state.receipts).toHaveLength(0);
    expect(sample.req.transactionID).toBeUndefined();
    sample.state.failReceipt = false;
    const result = await sample.service.syncGit(sample.state.task.id, {
      expectedRevision: 1,
    });
    expect(taskGitSyncSchema.safeParse(result).success).toBe(true);
    expect(sample.state.syncs).toHaveLength(1);
    expect(sample.state.receipts).toHaveLength(1);
    expect(sample.port).toHaveBeenCalledTimes(2);
  });

  it("refuses stale requests, invalid keys, forged fields and inherited transactions before provider", async () => {
    const sample = fixture();
    expect(
      taskGitSyncInputSchema.safeParse({ expectedRevision: 1, items: [] })
        .success,
    ).toBe(false);
    expect(
      taskGitSyncInputSchema.safeParse({ expectedRevision: 0 }).success,
    ).toBe(false);
    for (const command of [
      {},
      { expectedRevision: 1, actorId: "2" },
      { expectedRevision: 2 },
    ])
      await expect(
        sample.service.syncGit(sample.state.task.id, command),
      ).rejects.toMatchObject({
        status:
          "expectedRevision" in command && command.expectedRevision === 2
            ? 409
            : 422,
      });
    sample.req.headers.delete("Idempotency-Key");
    await expect(
      sample.service.syncGit(sample.state.task.id, { expectedRevision: 1 }),
    ).rejects.toMatchObject({ status: 422 });
    sample.req.transactionID = "caller-owned";
    sample.find.mockClear();
    await expect(
      sample.service.syncGit(sample.state.task.id, { expectedRevision: 1 }),
    ).rejects.toMatchObject({ status: 503 });
    expect(sample.req.transactionID).toBe("caller-owned");
    expect(sample.find).not.toHaveBeenCalled();
    expect(sample.port).not.toHaveBeenCalled();
  });

  it("rechecks membership and role before replay instead of treating the receipt as authorization", async () => {
    for (const mode of ["membership", "admission"] as const) {
      const sample = fixture();
      await sample.service.syncGit(sample.state.task.id, {
        expectedRevision: 1,
      });
      if (mode === "membership") sample.state.project.memberIds = ["2"];
      else sample.state.admitted = false;
      await expect(
        sample.service.syncGit(sample.state.task.id, { expectedRevision: 1 }),
      ).rejects.toMatchObject({ status: mode === "membership" ? 404 : 403 });
      expect(sample.port).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects revision, same-revision binding, membership and actor races after network without recording facts", async () => {
    for (const mode of [
      "revision",
      "bindings",
      "membership",
      "actor",
    ] as const) {
      const sample = fixture();
      sample.options.observeGitBinding = async ({ binding }) => {
        if (mode === "revision") sample.state.task.revision += 1;
        if (mode === "bindings")
          sample.state.task.gitBindings[0].commitSha = "b".repeat(40);
        if (mode === "membership") sample.state.project.memberIds = ["2"];
        if (mode === "actor")
          sample.req.user = {
            id: 2,
            collection: "users",
          } as PayloadRequest["user"];
        return observed(binding);
      };
      await expect(
        sample.service.syncGit(sample.state.task.id, { expectedRevision: 1 }),
      ).rejects.toMatchObject({
        status: mode === "membership" ? 404 : mode === "actor" ? 403 : 409,
      });
      expect(sample.state.syncs).toHaveLength(0);
      expect(sample.state.receipts).toHaveLength(0);
    }
  });

  it("stores unavailable outcomes honestly and replays them without implicit network refresh", async () => {
    const sample = fixture();
    sample.options.observeGitBinding = undefined;
    const first = await sample.service.syncGit(sample.state.task.id, {
      expectedRevision: 1,
    });
    expect(first.items).toMatchObject([
      { status: "unavailable", reason: "not_configured" },
    ]);
    sample.options.observeGitBinding = sample.port;
    expect(
      await sample.service.syncGit(sample.state.task.id, {
        expectedRevision: 1,
      }),
    ).toEqual(first);
    expect(sample.port).not.toHaveBeenCalled();
    sample.req.headers.set("Idempotency-Key", randomUUID());
    expect(
      (
        await sample.service.syncGit(sample.state.task.id, {
          expectedRevision: 1,
        })
      ).items,
    ).toMatchObject([{ status: "observed" }]);
    expect(sample.state.syncs).toHaveLength(2);
  });

  it("returns newest-first history and binds descending cursors to actor, scope and direction", async () => {
    const sample = fixture();
    const first = await sample.service.syncGit(sample.state.task.id, {
      expectedRevision: 1,
    });
    sample.state.syncs = Array.from({ length: 51 }, (_, index) => ({
      id: index + 1,
      taskId: first.taskId,
      projectId: first.projectId,
      record: { ...first, id: randomUUID() } satisfies TaskGitSyncDto,
    }));
    const page = await sample.service.gitSyncs(sample.state.task.id);
    expect(page.items).toHaveLength(50);
    expect(page.items[0].id).toBe(
      (sample.state.syncs[50].record as TaskGitSyncDto).id,
    );
    const final = await sample.service.gitSyncs(
      sample.state.task.id,
      page.nextCursor,
    );
    expect(final.items).toHaveLength(1);
    expect(final.items[0].id).toBe(
      (sample.state.syncs[0].record as TaskGitSyncDto).id,
    );
    expect(final.nextCursor).toBeNull();
    sample.req.user = { id: 2, collection: "users" } as PayloadRequest["user"];
    await expect(
      sample.service.gitSyncs(sample.state.task.id, page.nextCursor),
    ).rejects.toMatchObject({ status: 422 });
    sample.req.user = { id: 1, collection: "users" } as PayloadRequest["user"];
    const where: Where = {
      and: [
        { taskId: { equals: first.taskId } },
        { projectId: { equals: first.projectId } },
      ],
    };
    await expect(
      new TaskStoreRepository(sample.req).page(
        TASK_GIT_SYNCS_SLUG,
        where,
        page.nextCursor,
        "asc",
      ),
    ).rejects.toMatchObject({ status: 422 });
    sample.state.project.memberIds = ["2"];
    await expect(
      sample.service.gitSyncs(sample.state.task.id),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects malformed stored receipt without provider or replacement and denies arbitrary HTTP query inputs", async () => {
    const sample = fixture();
    await sample.service.syncGit(sample.state.task.id, { expectedRevision: 1 });
    sample.state.receipts[0].receipt = { arbitrary: "raw-document" };
    await expect(
      sample.service.syncGit(sample.state.task.id, { expectedRevision: 1 }),
    ).rejects.toMatchObject({ status: 503 });
    expect(sample.port).toHaveBeenCalledTimes(1);
    const endpoint = createTaskEndpoints(sample.options).find(
      (item) => item.path.endsWith("/git-syncs") && item.method === "get",
    )!;
    for (const suffix of ["?after=a&after=b", "?repositoryId=foreign/repo"]) {
      const req = Object.assign(
        new Request(
          `http://localhost/api/task-manager/tasks/${sample.state.task.id}/git-syncs${suffix}`,
        ),
        {
          user: sample.req.user,
          payload: sample.req.payload,
          routeParams: { id: sample.state.task.id },
        },
      ) as unknown as PayloadRequest;
      expect(((await endpoint.handler(req)) as Response).status).toBe(422);
    }
  });

  it("rejects misleading complete CI summaries, unsafe labels, duplicate contexts and another SHA", () => {
    const value = fixture().state.task.gitBindings[0];
    const valid = observed(value);
    const statuses = valid.ci.commitStatuses;
    const runs = valid.ci.checkRuns;
    if (statuses.status !== "observed" || runs.status !== "observed")
      throw new Error("fixture_ci_required");
    const invalid = [
      {
        ...valid,
        ci: {
          ...valid.ci,
          commitStatuses: {
            ...statuses,
            items: [],
            totalCount: 0,
            combinedState: "success",
          },
        },
      },
      {
        ...valid,
        ci: {
          ...valid.ci,
          commitStatuses: {
            ...statuses,
            totalCount: 2,
            items: [
              statuses.items[0],
              { ...statuses.items[0], id: "19", context: "LINT" },
            ],
          },
        },
      },
      {
        ...valid,
        ci: {
          ...valid.ci,
          commitStatuses: {
            ...statuses,
            items: [{ ...statuses.items[0], context: "   " }],
          },
        },
      },
      {
        ...valid,
        ci: {
          ...valid.ci,
          checkRuns: { ...runs, items: [{ ...runs.items[0], name: "   " }] },
        },
      },
      {
        ...valid,
        ci: {
          ...valid.ci,
          checkRuns: {
            ...runs,
            items: [{ ...runs.items[0], headSha: "b".repeat(40) }],
          },
        },
      },
      {
        ...valid,
        ci: {
          ...valid.ci,
          checkRuns: {
            ...runs,
            items: [{ ...runs.items[0], token: "fixture-only-private-value" }],
          },
        },
      },
    ];
    for (const result of invalid)
      expect(
        taskGitObservationProviderResultSchema.safeParse(result).success,
      ).toBe(false);
    expect(
      taskGitObservationProviderResultSchema.safeParse(valid).success,
    ).toBe(true);
    expect(
      taskGitObservationProviderResultSchema.safeParse({
        ...valid,
        ci: {
          ...valid.ci,
          commitStatuses: {
            ...statuses,
            totalCount: 2,
            items: [
              statuses.items[0],
              { ...statuses.items[0], id: "19", context: " lint" },
            ],
          },
        },
      }).success,
    ).toBe(true);
    expect(
      taskGitObservationProviderResultSchema.safeParse({
        ...valid,
        ci: {
          ...valid.ci,
          commitStatuses: {
            ...statuses,
            items: [],
            totalCount: 0,
            combinedState: "pending",
          },
        },
      }).success,
    ).toBe(true);
  });
});
