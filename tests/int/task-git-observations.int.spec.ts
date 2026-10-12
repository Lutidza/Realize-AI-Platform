/**
 * @file tests/int/task-git-observations.int.spec.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Проверяет read-only Git observation, строгие DTO, admission и гонки task revision/membership.
 * @see documentation/specifications/task-management-execution.md
 */
// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";
import type {
  TaskDto,
  TaskGitBinding,
  TaskProjectDto,
} from "../../packages/payload-task-manager/src/contracts/TaskManager.types";
import type { TaskGitObservationProviderResult } from "../../packages/payload-task-manager/src/contracts/TaskGitObservation.types";
import {
  taskGitObservationProviderResultSchema,
  taskGitObservationsSchema,
} from "../../packages/payload-task-manager/src/contracts/taskGitObservation.schemas";
import type { TaskGitBindingObserver } from "../../packages/payload-task-manager/src/TaskManagerOptions.types";
import { TaskManagerService } from "../../packages/payload-task-manager/src/server/TaskManager.service";
import { createTaskEndpoints } from "../../packages/payload-task-manager/src/server/taskManagerEndpoints.controller";
import { resolveTaskManagerOptions } from "../../packages/payload-task-manager/src/taskManagerOptions.config";
import {
  TASK_PROJECTS_SLUG,
  TASKS_SLUG,
} from "../../packages/payload-task-manager/src/taskManager.constants";

function binding(index = 0): TaskGitBinding {
  return {
    repositoryId: "fixture-owner/platform",
    commitSha: index.toString(16).padStart(40, "0"),
    purpose: "platform-core",
    source: "manual",
    verification: "unverified",
  };
}

function observed(
  value: TaskGitBinding,
): Extract<TaskGitObservationProviderResult, { status: "observed" }> {
  const url = `https://github.com/${value.repositoryId}`;
  return {
    status: "observed",
    repository: { id: "12345", fullName: value.repositoryId, url },
    commit: { sha: value.commitSha, url: `${url}/commit/${value.commitSha}` },
    pullRequests: [
      {
        number: 7,
        url: `${url}/pull/7`,
        state: "open",
        draft: true,
        merged: false,
      },
      {
        number: 9,
        url: `${url}/pull/9`,
        state: "closed",
        draft: false,
        merged: true,
      },
    ],
    pullRequestsComplete: true,
    ci: {
      checkRuns: { status: "unavailable", reason: "provider_unavailable" },
      commitStatuses: { status: "unavailable", reason: "provider_unavailable" },
    },
  };
}

function fixture(
  gitBindings: TaskGitBinding[] = [binding()],
  observeGitBinding?: TaskGitBindingObserver,
) {
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
  const task: TaskDto = {
    id: randomUUID(),
    key: "TASK-1",
    projectId: project.id,
    listId: randomUUID(),
    title: "Task",
    description: "",
    status: "review",
    priority: "normal",
    assigneeId: null,
    gitBindings,
    revision: 4,
    createdBy: "1",
    updatedBy: "1",
    createdAt: now,
    updatedAt: now,
  };
  const state = { project, task, admitted: true };
  const find = vi.fn(async (args: { collection: string }) => ({
    docs:
      args.collection === TASKS_SLUG
        ? [{ id: 1, record: state.task }]
        : args.collection === TASK_PROJECTS_SLUG
          ? [{ id: 1, record: state.project }]
          : [],
  }));
  const create = vi.fn();
  const update = vi.fn();
  const remove = vi.fn();
  const req = Object.assign(
    new Request("http://localhost/api/task-manager/tasks"),
    {
      user: { id: 1, collection: "users" },
      payload: { find, create, update, delete: remove },
    },
  ) as unknown as PayloadRequest;
  const admission = vi.fn(async () => state.admitted);
  const options = resolveTaskManagerOptions({
    userCollection: "users",
    canUseTaskManager: admission,
    participantWhere: () => ({ roles: { contains: "admin" } }),
    observeGitBinding,
  });
  const service = new TaskManagerService(req, options);
  return {
    state,
    req,
    options,
    service,
    find,
    create,
    update,
    remove,
    admission,
  };
}

describe("Task Git observation trust boundary", () => {
  it("returns explicit live facts without promoting or writing the saved manual binding", async () => {
    const port = vi.fn(
      async ({ binding: value }: Parameters<TaskGitBindingObserver>[0]) =>
        observed(value),
    );
    const sample = fixture([binding()], port);
    const before = JSON.stringify(sample.state);
    const result = await sample.service.gitObservations(sample.state.task.id);
    expect(taskGitObservationsSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      taskId: sample.state.task.id,
      taskRevision: 4,
      complete: true,
      items: [
        {
          status: "observed",
          binding: { source: "manual", verification: "unverified" },
        },
      ],
    });
    expect(Number.isNaN(Date.parse(result.observedAt))).toBe(false);
    expect(port).toHaveBeenCalledWith({ binding: binding(), req: sample.req });
    expect(JSON.stringify(sample.state)).toBe(before);
    expect(sample.create).not.toHaveBeenCalled();
    expect(sample.update).not.toHaveBeenCalled();
    expect(sample.remove).not.toHaveBeenCalled();
    expect(sample.admission).toHaveBeenCalledTimes(2);
  });

  it("authorizes admission and task membership before any owner call", async () => {
    for (const mode of ["anonymous", "admission", "membership"] as const) {
      const port = vi.fn(
        async ({ binding: value }: Parameters<TaskGitBindingObserver>[0]) =>
          observed(value),
      );
      const sample = fixture([binding()], port);
      if (mode === "anonymous") sample.req.user = null;
      if (mode === "admission") sample.state.admitted = false;
      if (mode === "membership") sample.state.project.memberIds = ["2"];
      await expect(
        sample.service.gitObservations(sample.state.task.id),
      ).rejects.toMatchObject({
        status: mode === "anonymous" ? 401 : mode === "admission" ? 403 : 404,
      });
      expect(port).not.toHaveBeenCalled();
      if (mode !== "membership") expect(sample.find).not.toHaveBeenCalled();
    }
  });

  it("refuses externally owned transaction snapshots before task reads or provider calls", async () => {
    const port = vi.fn(
      async ({ binding: value }: Parameters<TaskGitBindingObserver>[0]) =>
        observed(value),
    );
    const sample = fixture([binding()], port);
    sample.req.transactionID = "caller-transaction";
    await expect(
      sample.service.gitObservations(sample.state.task.id),
    ).rejects.toMatchObject({
      status: 503,
      code: "STORAGE_UNAVAILABLE",
    });
    expect(sample.req.transactionID).toBe("caller-transaction");
    expect(sample.admission).not.toHaveBeenCalled();
    expect(sample.find).not.toHaveBeenCalled();
    expect(port).not.toHaveBeenCalled();
    expect(sample.create).not.toHaveBeenCalled();
    expect(sample.update).not.toHaveBeenCalled();
  });

  it("rejects revoked project membership after the owner response", async () => {
    const sample = fixture();
    sample.options.observeGitBinding = async ({ binding: value }) => {
      sample.state.project.memberIds = ["2"];
      return observed(value);
    };
    await expect(
      sample.service.gitObservations(sample.state.task.id),
    ).rejects.toMatchObject({ status: 404 });
    expect(sample.update).not.toHaveBeenCalled();
  });

  it("rejects revoked admission and changed actor after the owner response", async () => {
    for (const mode of ["admission", "actor", "anonymous"] as const) {
      const sample = fixture();
      sample.options.observeGitBinding = async ({ binding: value }) => {
        if (mode === "admission") sample.state.admitted = false;
        if (mode === "actor")
          sample.req.user = {
            id: 2,
            collection: "users",
          } as PayloadRequest["user"];
        if (mode === "anonymous") sample.req.user = null;
        return observed(value);
      };
      await expect(
        sample.service.gitObservations(sample.state.task.id),
      ).rejects.toMatchObject({
        status: mode === "anonymous" ? 401 : 403,
      });
    }
  });

  it("rejects stale facts when the task revision changes while reading Git", async () => {
    const sample = fixture();
    sample.options.observeGitBinding = async ({ binding: value }) => {
      sample.state.task.revision += 1;
      return observed(value);
    };
    await expect(
      sample.service.gitObservations(sample.state.task.id),
    ).rejects.toMatchObject({
      status: 409,
      code: "REVISION_CONFLICT",
    });
    expect(sample.create).not.toHaveBeenCalled();
    expect(sample.update).not.toHaveBeenCalled();
  });

  it("keeps unavailable Git isolated from ordinary task reads and handles empty bindings", async () => {
    const missing = fixture();
    const unavailable = await missing.service.gitObservations(
      missing.state.task.id,
    );
    expect(unavailable.items).toEqual([
      { binding: binding(), status: "unavailable", reason: "not_configured" },
    ]);
    await expect(
      missing.service.task(missing.state.task.id),
    ).resolves.toMatchObject({ title: "Task", revision: 4 });
    const port = vi.fn(
      async ({ binding: value }: Parameters<TaskGitBindingObserver>[0]) =>
        observed(value),
    );
    const empty = fixture([], port);
    await expect(
      empty.service.gitObservations(empty.state.task.id),
    ).resolves.toMatchObject({ complete: true, items: [] });
    expect(port).not.toHaveBeenCalled();
  });

  it("limits coverage to eight saved bindings and at most two concurrent calls in saved order", async () => {
    let active = 0;
    let maximum = 0;
    const port = vi.fn(
      async ({ binding: value }: Parameters<TaskGitBindingObserver>[0]) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise<void>((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return observed(value);
      },
    );
    const bindings = Array.from({ length: 50 }, (_, index) => binding(index));
    const sample = fixture(bindings, port);
    const result = await sample.service.gitObservations(sample.state.task.id);
    expect(result.complete).toBe(false);
    expect(result.items.map((item) => item.binding)).toEqual(
      bindings.slice(0, 8),
    );
    expect(result.items).toHaveLength(8);
    expect(maximum).toBe(2);
    expect(port).toHaveBeenCalledTimes(8);
    expect(taskGitObservationsSchema.safeParse(result).success).toBe(true);
  });

  it("does not allow the observer to mutate the saved or returned binding through its argument", async () => {
    const sample = fixture();
    sample.options.observeGitBinding = async ({ binding: value }) => {
      value.repositoryId = "other-owner/other-repo";
      value.commitSha = "a".repeat(40);
      return observed(value);
    };
    const result = await sample.service.gitObservations(sample.state.task.id);
    expect(result.items).toEqual([
      { binding: binding(), status: "unavailable", reason: "invalid_response" },
    ]);
    expect(sample.state.task.gitBindings).toEqual([binding()]);
  });

  it("turns provider exceptions and malformed secrets into safe per-binding unavailable results", async () => {
    const invalid = [
      {
        ...observed(binding()),
        credentials: { private: "fixture-only-private-value" },
      },
      {
        ...observed(binding()),
        repository: {
          ...observed(binding()).repository,
          token: "fixture-only-private-value",
        },
      },
      {
        status: "unavailable",
        reason: "invalid_response",
        message: "fixture-only-private-value",
      },
      { status: "unavailable", reason: "commit_not_found" },
      null,
      new Proxy(
        {},
        {
          get: (target, property) => {
            if (property === "status")
              throw new Error("fixture-only-private-value");
            return Reflect.get(target, property);
          },
        },
      ),
    ];
    for (const value of invalid) {
      const sample = fixture(
        [binding()],
        async () => value as TaskGitObservationProviderResult,
      );
      const result = await sample.service.gitObservations(sample.state.task.id);
      expect(result.items).toEqual([
        {
          binding: binding(),
          status: "unavailable",
          reason: "invalid_response",
        },
      ]);
      expect(JSON.stringify(result)).not.toContain(
        "fixture-only-private-value",
      );
    }
    const failed = fixture([binding()], async () => {
      throw new Error("fixture-only-private-value");
    });
    await expect(
      failed.service.gitObservations(failed.state.task.id),
    ).resolves.toMatchObject({
      items: [{ status: "unavailable", reason: "provider_unavailable" }],
    });
    await expect(
      failed.service.task(failed.state.task.id),
    ).resolves.toMatchObject({ title: "Task" });
  });

  it("rejects facts for another repository or SHA and retains 64-hex manual identities as unavailable", async () => {
    for (const value of [
      observed({ ...binding(), repositoryId: "other-owner/other-repo" }),
      observed({ ...binding(), commitSha: "a".repeat(40) }),
    ]) {
      const sample = fixture([binding()], async () => value);
      await expect(
        sample.service.gitObservations(sample.state.task.id),
      ).resolves.toMatchObject({
        items: [{ status: "unavailable", reason: "invalid_response" }],
      });
    }
    const manual = { ...binding(), commitSha: "a".repeat(64) };
    const sample = fixture([manual], async () => ({
      status: "unavailable",
      reason: "unsupported_sha",
    }));
    const result = await sample.service.gitObservations(sample.state.task.id);
    expect(result.items).toEqual([
      { binding: manual, status: "unavailable", reason: "unsupported_sha" },
    ]);
    expect(taskGitObservationsSchema.safeParse(result).success).toBe(true);
  });

  it("rejects noncanonical URLs, duplicate PRs, impossible PR states and unsafe numeric identities", () => {
    const valid = observed(binding());
    const repositoryUrl = valid.repository.url;
    const credentialUrl =
      "https://" +
      ["fixture-user", "fixture-password"].join(":") +
      "@github.com/fixture-owner/platform";
    for (const url of [
      credentialUrl,
      `${repositoryUrl}?access_token=fixture-value`,
      `${repositoryUrl}#fragment`,
      repositoryUrl.replace("https:", "http:"),
      repositoryUrl.replace("github.com", "github.com.invalid"),
      "javascript:alert(1)",
    ])
      expect(
        taskGitObservationProviderResultSchema.safeParse({
          ...valid,
          repository: { ...valid.repository, url },
        }).success,
      ).toBe(false);
    for (const value of [
      { ...valid, repository: { ...valid.repository, id: "0" } },
      { ...valid, repository: { ...valid.repository, id: "9007199254740992" } },
      {
        ...valid,
        commit: {
          ...valid.commit,
          url: `${repositoryUrl}/commit/${"b".repeat(40)}`,
        },
      },
      {
        ...valid,
        pullRequests: [valid.pullRequests[0], valid.pullRequests[0]],
      },
      { ...valid, pullRequests: [{ ...valid.pullRequests[0], merged: true }] },
      {
        ...valid,
        pullRequests: [
          { ...valid.pullRequests[0], url: `${repositoryUrl}/pull/100` },
        ],
      },
      {
        ...valid,
        pullRequests: Array.from({ length: 21 }, (_, index) => ({
          ...valid.pullRequests[0],
          number: index + 1,
          url: `${repositoryUrl}/pull/${index + 1}`,
        })),
      },
    ])
      expect(
        taskGitObservationProviderResultSchema.safeParse(value).success,
      ).toBe(false);
    expect(
      taskGitObservationProviderResultSchema.safeParse({
        ...valid,
        pullRequestsComplete: false,
      }).success,
    ).toBe(true);
  });

  it("rejects unknown and duplicate query fields without provider calls and returns no-store DTO", async () => {
    const port = vi.fn(
      async ({ binding: value }: Parameters<TaskGitBindingObserver>[0]) =>
        observed(value),
    );
    const sample = fixture([binding()], port);
    const endpoint = createTaskEndpoints(sample.options).find((item) =>
      item.path.endsWith("/git-observations"),
    )!;
    for (const suffix of [
      "?commitSha=a",
      "?after=a&after=b",
      "?repositoryId=foreign/repo",
    ]) {
      const req = Object.assign(
        new Request(
          `http://localhost/api/task-manager/tasks/${sample.state.task.id}/git-observations${suffix}`,
        ),
        {
          user: sample.req.user,
          payload: sample.req.payload,
          routeParams: { id: sample.state.task.id },
        },
      ) as unknown as PayloadRequest;
      const response = (await endpoint.handler(req)) as Response;
      expect(response.status).toBe(422);
      expect(port).not.toHaveBeenCalled();
      expect(sample.find).not.toHaveBeenCalled();
    }
    sample.req.routeParams = { id: sample.state.task.id };
    const response = (await endpoint.handler(sample.req)) as Response;
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(taskGitObservationsSchema.safeParse(body.data).success).toBe(true);
  });
});
