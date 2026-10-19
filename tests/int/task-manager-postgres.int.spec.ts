/**
 * @file tests/int/task-manager-postgres.int.spec.ts
 * @version 1.3.0
 * @date 2026-10-19
 * @description Проверяет постоянные задачи, ACL, replay, CAS и защищённую историю на отдельной мигрированной PostgreSQL БД.
 * @see documentation/specifications/task-management-execution.md
 */
// @vitest-environment node
import { randomBytes, randomUUID } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import { Client } from "pg";
import type { MigrateUpArgs, PostgresAdapter } from "@payloadcms/db-postgres";
import {
  createLocalReq,
  initTransaction,
  commitTransaction,
  killTransaction,
  type CollectionSlug,
  type Payload,
  type PayloadRequest,
  type RequiredDataFromCollectionSlug,
} from "payload";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTaskManagerService } from "@realize/payload-task-manager/server";
import type {
  TaskDto,
  TaskEditableFields,
  TaskProjectDto,
  TaskGitObservationProviderResult,
} from "@realize/payload-task-manager/contracts";
import {
  TASK_COLLECTION_SLUGS,
  TASK_PROJECTS_SLUG,
  TASKS_SLUG,
} from "../../packages/payload-task-manager/src/taskManager.constants";
import { migrations } from "../../src/migrations";
import { taskManagerOptions } from "../../src/plugins/taskManager.config";
import { openMcpPayload } from "../../services/internal-mcp/src/openMcpPayload.adapter";

describe.skipIf(!process.env.TASK_TEST_DATABASE_URI)(
  "durable Task Manager on isolated PostgreSQL",
  () => {
    let db: Client;
    let payload: Payload;
    let owner: NonNullable<PayloadRequest["user"]>;
    let member: NonNullable<PayloadRequest["user"]>;
    let stranger: NonNullable<PayloadRequest["user"]>;
    let customer: NonNullable<PayloadRequest["user"]>;
    const foundation = migrations.find((migration) =>
      /_task_manager_foundation$/.test(migration.name),
    )!;
    const gitMigration = migrations.find((migration) =>
      /_task_git_sync$/.test(migration.name),
    )!;
    const workspaceMigration = migrations.find((migration) =>
      /_task_workspace_intake$/.test(migration.name),
    )!;

    const migrate = async (operation: typeof foundation.up) => {
      const dialect = new PgDialect();
      await db.query("BEGIN");
      try {
        await operation({
          db: {
            execute: async (statement) => {
              if (typeof statement === "string") return db.query(statement);
              const query = dialect.sqlToQuery(statement.getSQL());
              return db.query(query.sql, query.params);
            },
          },
        } as MigrateUpArgs);
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }
    };
    const request = async (
      actor: PayloadRequest["user"] = owner,
      key = randomUUID(),
    ) => {
      const req = await createLocalReq({ user: actor ?? undefined }, payload);
      req.headers.set("idempotency-key", key);
      return req;
    };
    const service = async (
      actor: PayloadRequest["user"] = owner,
      key = randomUUID(),
    ) =>
      createTaskManagerService(await request(actor, key), taskManagerOptions);
    const editable = (task?: TaskDto): TaskEditableFields => ({
      title: task?.title ?? "Проверить постоянную задачу",
      description:
        task?.description ?? "Критерии сохраняются вместе с задачей.",
      status: task?.status ?? "backlog",
      priority: task?.priority ?? "normal",
      assigneeId: task?.assigneeId ?? null,
      gitBindings: task?.gitBindings ?? [],
    });
    const project = async (): Promise<{
      project: TaskProjectDto;
      listId: string;
    }> => {
      const created = await (
        await service()
      ).createProject({
        title: "Task Manager fixture",
        description: "Изолированный проект проверки",
        memberIds: [String(member.id)],
      });
      const lists = await (await service()).lists(created.id);
      expect(lists.items).toHaveLength(1);
      expect(lists.items[0]).toMatchObject({
        projectId: created.id,
        title: "Задачи",
        revision: 1,
      });
      return { project: created, listId: lists.items[0].id };
    };
    const create = async () => {
      const scope = await project();
      const task = await (
        await service()
      ).createTask({
        ...editable(),
        projectId: scope.project.id,
        listId: scope.listId,
      });
      return { ...scope, task };
    };

    beforeAll(async () => {
      const uri = new URL(process.env.TASK_TEST_DATABASE_URI!);
      if (
        uri.hostname !== "127.0.0.1" ||
        !/^realize_task_fixture_[a-z0-9]+$/.test(uri.pathname.slice(1)) ||
        process.env.DATABASE_URI !== uri.href ||
        process.env.PAYLOAD_DB_PUSH !== "false" ||
        process.env.REALIZE_AI_RUNTIME_ISOLATED !== "true"
      )
        throw new Error("ISOLATED_TASK_DATABASE_REQUIRED");
      expect(foundation.name).toMatch(/_task_manager_foundation$/);
      expect(gitMigration.name).toMatch(/_task_git_sync$/);
      db = new Client({ connectionString: uri.href });
      await db.connect();
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'",
          )
        ).rows[0].count,
      ).toBe(0);
      for (const migration of migrations) await migrate(migration.up);
      await migrate(workspaceMigration.down);
      await migrate(gitMigration.down);
      await migrate(foundation.down);
      await migrate(foundation.up);
      await migrate(gitMigration.up);
      await migrate(workspaceMigration.up);
      payload = await openMcpPayload();
      const user = async (role: "admin" | "customer", name: string) => ({
        ...(await payload.create({
          collection: "users",
          overrideAccess: true,
          data: {
            email: `task-${randomUUID()}@example.invalid`,
            password: randomBytes(32).toString("base64url"),
            roles: [role],
            name,
          },
        })),
        collection: "users" as const,
      });
      owner = await user("admin", "Task owner fixture");
      member = await user("admin", "Task member fixture");
      stranger = await user("admin", "Task stranger fixture");
      customer = await user("customer", "Task customer fixture");
    }, 60000);

    afterAll(async () => {
      try {
        await payload?.destroy();
      } finally {
        await db?.end();
      }
    });

    it("persists project, default list, task and actor history across a Payload restart", async () => {
      const { project: created, listId, task } = await create();
      expect(task).toMatchObject({
        revision: 1,
        createdBy: String(owner.id),
        updatedBy: String(owner.id),
      });
      expect(task.key).toMatch(/^TASK-[1-9][0-9]*$/);
      expect((await (await service()).events(task.id)).items).toMatchObject([
        { actorId: String(owner.id), kind: "created", revision: 1 },
      ]);
      await payload.destroy();
      payload = await openMcpPayload();
      expect(await (await service()).task(task.id)).toEqual(task);
      expect((await (await service()).projects()).items).toContainEqual(
        created,
      );
      expect((await (await service()).lists(created.id)).items[0].id).toBe(
        listId,
      );
    });

    it("replays project/task creation exactly and rejects changed commands using the same key", async () => {
      const key = randomUUID();
      const input = { title: "Replay project", description: "", memberIds: [] };
      const first = await (await service(owner, key)).createProject(input);
      expect(await (await service(owner, key)).createProject(input)).toEqual(
        first,
      );
      await expect(
        (await service(owner, key)).createProject({
          ...input,
          title: "Changed",
        }),
      ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
      const listId = (await (await service()).lists(first.id)).items[0].id;
      const taskKey = randomUUID();
      const command = { ...editable(), projectId: first.id, listId };
      const task = await (await service(owner, taskKey)).createTask(command);
      expect(await (await service(owner, taskKey)).createTask(command)).toEqual(
        task,
      );
      await expect(
        (await service(owner, taskKey)).createTask({
          ...command,
          title: "Changed",
        }),
      ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
      expect((await (await service()).tasks(first.id, listId)).items).toEqual([
        task,
      ]);
      expect((await (await service()).events(task.id)).items).toHaveLength(1);
    });

    it("lets only the owner update projects, keeps owner membership and compares member sets", async () => {
      const { project: created, listId, task } = await create();
      const command = {
        title: "Управляемый проект",
        description: "Обновлённое описание",
        memberIds: [String(member.id), String(stranger.id)],
        expectedRevision: created.revision,
      };
      expect(await (await service(member)).projectById(created.id)).toEqual(
        created,
      );
      expect(await (await service(member)).listById(listId)).toMatchObject({
        id: listId,
        projectId: created.id,
      });
      await expect(
        (await service(member)).updateProject(created.id, command),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        (await service(stranger)).updateProject(created.id, command),
      ).rejects.toMatchObject({ status: 404 });
      const key = randomUUID();
      const changed = await (
        await service(owner, key)
      ).updateProject(created.id, command);
      expect(changed).toMatchObject({
        id: created.id,
        ownerId: String(owner.id),
        revision: 2,
        title: command.title,
        description: command.description,
      });
      expect([...changed.memberIds].sort()).toEqual(
        [String(owner.id), String(member.id), String(stranger.id)].sort(),
      );
      expect((await (await service(stranger)).projects()).items).toContainEqual(
        changed,
      );
      expect(
        await (
          await service(owner, key)
        ).updateProject(created.id, {
          ...command,
          memberIds: [...changed.memberIds].reverse(),
        }),
      ).toEqual(changed);
      await expect(
        (await service(owner, key)).updateProject(created.id, {
          ...command,
          title: "Different command",
        }),
      ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
      const noOp = await (
        await service()
      ).updateProject(created.id, {
        ...command,
        memberIds: [...changed.memberIds].reverse(),
        expectedRevision: changed.revision,
      });
      expect(noOp).toEqual(changed);
      expect(await (await service()).task(task.id)).toEqual(task);
      expect(await (await service()).listById(listId)).toMatchObject({
        id: listId,
        projectId: created.id,
        revision: 1,
      });
      const later = await (
        await service()
      ).updateProject(created.id, {
        ...command,
        title: "Latest title",
        expectedRevision: changed.revision,
      });
      expect(
        await (await service(owner, key)).updateProject(created.id, command),
      ).toEqual(changed);
      expect(await (await service()).projectById(created.id)).toEqual(later);
    });

    it("creates and renames lists with member ACL, stable references, receipts and no-op revisions", async () => {
      const { project: created } = await project();
      const createKey = randomUUID();
      const command = { projectId: created.id, title: "Дополнительный список" };
      const list = await (await service(member, createKey)).createList(command);
      expect(list).toMatchObject({
        projectId: created.id,
        title: command.title,
        revision: 1,
      });
      expect(
        await (await service(member, createKey)).createList(command),
      ).toEqual(list);
      expect((await (await service()).lists(created.id)).items).toHaveLength(2);
      await expect(
        (await service(member, createKey)).createList({
          ...command,
          title: "Other",
        }),
      ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
      await expect(
        (await service(stranger)).createList(command),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        (await service(stranger)).listById(list.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        (await service(stranger)).updateList(list.id, {
          title: "Hidden",
          expectedRevision: 1,
        }),
      ).rejects.toMatchObject({ status: 404 });
      const task = await (
        await service()
      ).createTask({ ...editable(), projectId: created.id, listId: list.id });
      const updateKey = randomUUID();
      const renamed = await (
        await service(member, updateKey)
      ).updateList(list.id, { title: "Переименован", expectedRevision: 1 });
      expect(renamed).toMatchObject({
        id: list.id,
        projectId: created.id,
        revision: 2,
      });
      expect(
        await (
          await service()
        ).updateList(list.id, { title: renamed.title, expectedRevision: 2 }),
      ).toEqual(renamed);
      const latest = await (
        await service()
      ).updateList(list.id, { title: "Последнее имя", expectedRevision: 2 });
      expect(
        await (
          await service(member, updateKey)
        ).updateList(list.id, { title: "Переименован", expectedRevision: 1 }),
      ).toEqual(renamed);
      expect(
        await (await service(member, createKey)).createList(command),
      ).toEqual(list);
      expect(await (await service()).listById(list.id)).toEqual(latest);
      expect(await (await service()).task(task.id)).toEqual(task);
      await expect(
        (await service(member, updateKey)).updateList(list.id, {
          title: "Other",
          expectedRevision: 1,
        }),
      ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    });

    it("revokes member reads and receipt replay without rewriting assigned tasks", async () => {
      const { project: created, listId } = await project();
      const task = await (
        await service()
      ).createTask({
        ...editable(),
        projectId: created.id,
        listId,
        assigneeId: String(member.id),
      });
      const createKey = randomUUID();
      const createCommand = { projectId: created.id, title: "Member list" };
      const list = await (
        await service(member, createKey)
      ).createList(createCommand);
      const updateKey = randomUUID();
      const updateCommand = { title: "Member edit", expectedRevision: 1 };
      await (
        await service(member, updateKey)
      ).updateList(list.id, updateCommand);
      const changed = await (
        await service()
      ).updateProject(created.id, {
        title: created.title,
        description: created.description,
        memberIds: [],
        expectedRevision: 1,
      });
      expect(changed.memberIds).toEqual([String(owner.id)]);
      expect(
        (await (await service(member)).projects()).items.some(
          (item) => item.id === created.id,
        ),
      ).toBe(false);
      for (const call of [
        async () => (await service(member)).projectById(created.id),
        async () => (await service(member)).listById(list.id),
        async () => (await service(member)).task(task.id),
        async () =>
          (await service(member, createKey)).createList(createCommand),
        async () =>
          (await service(member, updateKey)).updateList(list.id, updateCommand),
      ])
        await expect(call()).rejects.toMatchObject({ status: 404 });
      expect(await (await service()).task(task.id)).toEqual(task);
      await expect(
        (await service()).updateTask(task.id, {
          ...editable(task),
          title: "Assignee must be current",
          expectedRevision: 1,
        }),
      ).rejects.toMatchObject({ status: 422 });
      expect(
        await (
          await service()
        ).updateTask(task.id, {
          ...editable(task),
          assigneeId: null,
          expectedRevision: 1,
        }),
      ).toMatchObject({ assigneeId: null, revision: 2 });
    });

    it("serializes project and list CAS races under their existing project lock", async () => {
      const { project: created, listId } = await project();
      const projectResults = await Promise.allSettled(
        [0, 1].map(async (index) =>
          (await service()).updateProject(created.id, {
            title: `Project race ${index}`,
            description: created.description,
            memberIds: created.memberIds,
            expectedRevision: 1,
          }),
        ),
      );
      const listResults = await Promise.allSettled(
        [owner, member].map(async (actor, index) =>
          (await service(actor)).updateList(listId, {
            title: `List race ${index}`,
            expectedRevision: 1,
          }),
        ),
      );
      for (const results of [projectResults, listResults]) {
        expect(
          results.filter((item) => item.status === "fulfilled"),
        ).toHaveLength(1);
        expect(
          results.filter((item) => item.status === "rejected"),
        ).toMatchObject([
          { reason: { status: 409, code: "REVISION_CONFLICT" } },
        ]);
      }
      expect(await (await service()).projectById(created.id)).toMatchObject({
        revision: 2,
      });
      expect(await (await service()).listById(listId)).toMatchObject({
        revision: 2,
      });
    });

    it("rejects ineligible/oversized membership and rolls back container changes when receipt persistence fails", async () => {
      const { project: created, listId } = await project();
      const command = {
        title: "Changed",
        description: created.description,
        memberIds: [String(stranger.id)],
        expectedRevision: 1,
      };
      for (const memberIds of [
        [String(customer.id)],
        ["missing-user"],
        ["2147483648"],
        Array.from({ length: 101 }, (_, index) => `non-owner-${index}`),
      ])
        await expect(
          (await service()).updateProject(created.id, {
            ...command,
            memberIds,
          }),
        ).rejects.toMatchObject({ status: 422 });
      const originalList = await (await service()).listById(listId);
      const receiptsBefore = (
        await db.query(
          "SELECT count(*)::int AS count FROM realize_task_operations WHERE project_id=$1",
          [created.id],
        )
      ).rows[0].count;
      await db.query(`CREATE FUNCTION realize_task_test_fail_container_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.project_id = '${created.id}' THEN RAISE EXCEPTION 'TASK_TEST_CONTAINER_RECEIPT_FAILURE'; END IF;
        RETURN NEW; END $$;
        CREATE TRIGGER realize_task_test_container_receipt_failure BEFORE INSERT ON realize_task_operations
        FOR EACH ROW EXECUTE FUNCTION realize_task_test_fail_container_receipt();`);
      try {
        await expect(
          (await service()).updateProject(created.id, command),
        ).rejects.toThrow();
        await expect(
          (await service()).createList({
            projectId: created.id,
            title: "Rolled back",
          }),
        ).rejects.toThrow();
        await expect(
          (await service()).updateList(listId, {
            title: "Rolled back",
            expectedRevision: 1,
          }),
        ).rejects.toThrow();
        expect(await (await service()).projectById(created.id)).toEqual(
          created,
        );
        expect((await (await service(member)).projects()).items).toContainEqual(
          created,
        );
        expect(
          (await (await service(stranger)).projects()).items.some(
            (item) => item.id === created.id,
          ),
        ).toBe(false);
        expect((await (await service()).lists(created.id)).items).toEqual([
          originalList,
        ]);
        expect(
          (
            await db.query(
              "SELECT count(*)::int AS count FROM realize_task_operations WHERE project_id=$1",
              [created.id],
            )
          ).rows[0].count,
        ).toBe(receiptsBefore);
      } finally {
        await db.query(
          "DROP TRIGGER realize_task_test_container_receipt_failure ON realize_task_operations; DROP FUNCTION realize_task_test_fail_container_receipt();",
        );
      }
    });

    it("saves updates with the real actor and replays without increasing revision or event count", async () => {
      const { task } = await create();
      const key = randomUUID();
      const command = {
        ...editable(task),
        title: "Уточнённая задача",
        assigneeId: String(member.id),
        expectedRevision: 1,
      };
      const changed = await (
        await service(member, key)
      ).updateTask(task.id, command);
      expect(changed).toMatchObject({
        revision: 2,
        updatedBy: String(member.id),
      });
      expect(
        await (await service(member, key)).updateTask(task.id, command),
      ).toEqual(changed);
      await expect(
        (await service(member, key)).updateTask(task.id, {
          ...command,
          title: "Other",
        }),
      ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
      expect((await (await service()).events(task.id)).items).toMatchObject([
        { actorId: String(owner.id), kind: "created", revision: 1 },
        { actorId: String(member.id), kind: "updated", revision: 2 },
      ]);
      await expect(
        (await service()).updateTask(task.id, {
          ...editable(changed),
          expectedRevision: 2,
          updatedBy: String(stranger.id),
        }),
      ).rejects.toMatchObject({ status: 422, code: "INVALID_REQUEST" });
      expect((await (await service()).events(task.id)).items).toHaveLength(2);
    });

    it("serializes competing expectedRevision updates and rejects the losing editor", async () => {
      const { task } = await create();
      const actors = [owner, member];
      const result = await Promise.allSettled(
        actors.map(async (actor, index) =>
          (await service(actor)).updateTask(task.id, {
            ...editable(task),
            title: `Concurrent ${index}`,
            expectedRevision: task.revision,
          }),
        ),
      );
      const accepted = result.filter((item) => item.status === "fulfilled");
      const rejected = result.filter((item) => item.status === "rejected");
      expect(accepted).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({
        reason: { status: 409, code: "REVISION_CONFLICT" },
      });
      expect(await (await service()).task(task.id)).toMatchObject({
        revision: 2,
      });
      expect((await (await service()).events(task.id)).items).toHaveLength(2);
    });

    it("rolls back a failed audit atomically and rejects inherited mutations without harming the caller", async () => {
      const { project: created, listId, task } = await create();
      const key = randomUUID();
      const command = {
        ...editable(task),
        title: "Atomic update",
        expectedRevision: task.revision,
      };
      const req = await request();
      const receiptsBefore = await db.query(
        "SELECT count(*)::int AS count FROM realize_task_operations WHERE project_id=$1",
        [created.id],
      );
      await db.query(`CREATE FUNCTION realize_task_test_fail_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.task_id = '${task.id}' AND NEW.revision > 1 THEN RAISE EXCEPTION 'TASK_TEST_EVENT_FAILURE'; END IF;
        RETURN NEW; END $$;
        CREATE TRIGGER realize_task_test_event_failure BEFORE INSERT ON realize_task_events
        FOR EACH ROW EXECUTE FUNCTION realize_task_test_fail_event();`);
      try {
        await expect(
          (await service(owner, key)).updateTask(task.id, command),
        ).rejects.toThrow();
        expect(await (await service()).task(task.id)).toEqual(task);
        expect((await (await service()).events(task.id)).items).toHaveLength(1);
        const receiptsAfterFailure = await db.query(
          "SELECT count(*)::int AS count FROM realize_task_operations WHERE project_id=$1",
          [created.id],
        );
        expect(receiptsAfterFailure.rows[0].count).toBe(
          receiptsBefore.rows[0].count,
        );
        expect(await initTransaction(req)).toBe(true);
        const externalTransactionId = req.transactionID;
        const transaction = (payload.db as unknown as PostgresAdapter).sessions[
          String(req.transactionID)
        ]!.db;
        await transaction.execute(
          "SET LOCAL lock_timeout = '2500ms'; SET LOCAL statement_timeout = '15000ms'",
        );
        await payload.update({
          collection: "users",
          id: owner.id,
          data: { name: "Outer transaction survives" },
          req,
          overrideAccess: true,
        });
        const taskManager = createTaskManagerService(req, taskManagerOptions);
        for (const mutation of [
          () => taskManager.updateTask(task.id, command),
          () =>
            taskManager.createTask({
              ...editable(task),
              projectId: created.id,
              listId,
            }),
          () =>
            taskManager.createProject({
              title: "Must not be created",
              description: "",
              memberIds: [],
            }),
        ])
          await expect(mutation()).rejects.toMatchObject({
            status: 503,
            code: "STORAGE_UNAVAILABLE",
          });
        expect(req.transactionID).toBe(externalTransactionId);
        expect(await taskManager.task(task.id)).toEqual(task);
        expect((await taskManager.events(task.id)).items).toHaveLength(1);
        const settings = await transaction.execute(
          "SELECT current_setting('lock_timeout') AS lock_timeout, current_setting('statement_timeout') AS statement_timeout",
        );
        expect(settings.rows[0]).toEqual({
          lock_timeout: "2500ms",
          statement_timeout: "15s",
        });
        expect(
          (
            await payload.findByID({
              collection: "users",
              id: owner.id,
              req,
              overrideAccess: true,
            })
          ).name,
        ).toBe("Outer transaction survives");
        await commitTransaction(req);
        expect(await (await service()).task(task.id)).toEqual(task);
        expect(
          (
            await payload.findByID({
              collection: "users",
              id: owner.id,
              overrideAccess: true,
            })
          ).name,
        ).toBe("Outer transaction survives");
        const receiptsAfter = await db.query(
          "SELECT count(*)::int AS count FROM realize_task_operations WHERE project_id=$1",
          [created.id],
        );
        expect(receiptsAfter.rows[0].count).toBe(receiptsBefore.rows[0].count);
      } finally {
        if (req.transactionID) await killTransaction(req);
        await db.query(
          "DROP TRIGGER realize_task_test_event_failure ON realize_task_events; DROP FUNCTION realize_task_test_fail_event();",
        );
      }
      const changed = await (
        await service(owner, key)
      ).updateTask(task.id, command);
      expect(changed).toMatchObject({ revision: 2, title: "Atomic update" });
      expect((await (await service()).events(task.id)).items).toHaveLength(2);
      const receiptsAfterRetry = await db.query(
        "SELECT count(*)::int AS count FROM realize_task_operations WHERE project_id=$1",
        [created.id],
      );
      expect(receiptsAfterRetry.rows[0].count).toBe(
        receiptsBefore.rows[0].count + 1,
      );
    });

    it("rejects absent authentication, customers and unrelated project members", async () => {
      const { project: created, listId, task } = await create();
      await expect((await service(null)).projects()).rejects.toMatchObject({
        status: 401,
      });
      await expect((await service(customer)).projects()).rejects.toMatchObject({
        status: 403,
      });
      expect(
        (await (await service(stranger)).projects()).items,
      ).not.toContainEqual(created);
      const foreign = await service(stranger);
      for (const read of [
        () => foreign.task(task.id),
        () => foreign.lists(created.id),
        () => foreign.tasks(created.id, listId),
        () => foreign.events(task.id),
      ])
        await expect(read()).rejects.toMatchObject({
          status: 404,
          code: "NOT_FOUND",
        });
      const sibling = await project();
      await expect(
        (await service()).createTask({
          ...editable(),
          projectId: created.id,
          listId: sibling.listId,
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("uses real eligible participants and rejects assignments outside project membership", async () => {
      const participants = await (await service()).participants();
      expect(participants.items.map((user) => user.id)).toContain(
        String(member.id),
      );
      expect(participants.items.map((user) => user.id)).not.toContain(
        String(customer.id),
      );
      participants.items.forEach((user) =>
        expect(Object.keys(user).sort()).toEqual(["id", "name"]),
      );
      await expect(
        (await service()).createProject({
          title: "Invalid member",
          description: "",
          memberIds: [String(customer.id)],
        }),
      ).rejects.toMatchObject({ status: 422 });
      const { task } = await create();
      for (const assigneeId of [
        String(stranger.id),
        String(customer.id),
        "999999999",
      ])
        await expect(
          (await service()).updateTask(task.id, {
            ...editable(task),
            assigneeId,
            expectedRevision: 1,
          }),
        ).rejects.toMatchObject({ status: 422 });
      expect((await (await service()).task(task.id)).revision).toBe(1);
      expect((await (await service()).events(task.id)).items).toHaveLength(1);
    });

    it("keeps full SHA bindings unverified and rejects forged verification or delivery states", async () => {
      const { task } = await create();
      const binding = {
        repositoryId: "fixture/platform",
        commitSha: "a".repeat(40),
        purpose: "platform-core" as const,
        source: "manual" as const,
        verification: "unverified" as const,
      };
      const changed = await (
        await service()
      ).updateTask(task.id, {
        ...editable(task),
        expectedRevision: 1,
        gitBindings: [binding, { ...binding, commitSha: "b".repeat(64) }],
      });
      expect(changed.gitBindings).toEqual([
        binding,
        { ...binding, commitSha: "b".repeat(64) },
      ]);
      for (const patch of [
        { gitBindings: [{ ...binding, commitSha: "2ea03b1" }] },
        { gitBindings: [{ ...binding, verification: "verified" }] },
        { gitBindings: [binding, binding] },
        { status: "released" },
        { publishedVersion: "1.0.0" },
      ])
        await expect(
          (await service()).updateTask(task.id, {
            ...editable(changed),
            expectedRevision: 2,
            ...patch,
          }),
        ).rejects.toMatchObject({ status: 422, code: "INVALID_REQUEST" });
      expect((await (await service()).task(task.id)).revision).toBe(2);
    });

    it("denies generic collection CRUD even to an authenticated administrator", async () => {
      const { task } = await create();
      const row = await payload.find({
        collection: TASKS_SLUG as CollectionSlug,
        overrideAccess: true,
        where: { taskId: { equals: task.id } },
        depth: 0,
      });
      const req = await request();
      for (const collection of TASK_COLLECTION_SLUGS)
        await expect(
          payload.find({
            collection: collection as CollectionSlug,
            req,
            overrideAccess: false,
          }),
        ).rejects.toMatchObject({ status: 403 });
      await expect(
        payload.create({
          collection: TASKS_SLUG as CollectionSlug,
          req,
          overrideAccess: false,
          data: row.docs[0] as RequiredDataFromCollectionSlug<CollectionSlug>,
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        payload.update({
          collection: TASKS_SLUG as CollectionSlug,
          req,
          overrideAccess: false,
          id: row.docs[0].id,
          data: { revision: 99 },
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        payload.delete({
          collection: TASKS_SLUG as CollectionSlug,
          req,
          overrideAccess: false,
          id: row.docs[0].id,
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect(await (await service()).task(task.id)).toEqual(task);
    });

    it("paginates without duplicates and binds cursors to actor and project scope", async () => {
      const { project: created, listId } = await project();
      for (let index = 0; index < 51; index++)
        await (
          await service()
        ).createTask({
          ...editable(),
          title: `Page ${index}`,
          projectId: created.id,
          listId,
        });
      const first = await (await service()).tasks(created.id, listId);
      expect(first.items).toHaveLength(50);
      expect(first.nextCursor).toBeTypeOf("string");
      const next = await (
        await service()
      ).tasks(created.id, listId, first.nextCursor);
      expect(next.items).toHaveLength(1);
      expect(next.nextCursor).toBeNull();
      expect(
        new Set([...first.items, ...next.items].map((task) => task.id)).size,
      ).toBe(51);
      await expect(
        (await service(member)).tasks(created.id, listId, first.nextCursor),
      ).rejects.toMatchObject({ status: 422 });
      const sibling = await project();
      await expect(
        (await service()).tasks(
          sibling.project.id,
          sibling.listId,
          first.nextCursor,
        ),
      ).rejects.toMatchObject({ status: 422 });
    }, 60000);

    it("rechecks membership before replaying a previously authorized mutation", async () => {
      const { project: created, task } = await create();
      const key = randomUUID();
      const command = {
        ...editable(task),
        title: "Member update",
        expectedRevision: 1,
      };
      await (await service(member, key)).updateTask(task.id, command);
      const rows = await payload.find({
        collection: TASK_PROJECTS_SLUG as CollectionSlug,
        overrideAccess: true,
        where: { projectId: { equals: created.id } },
        depth: 0,
      });
      await payload.update({
        collection: TASK_PROJECTS_SLUG as CollectionSlug,
        overrideAccess: true,
        id: rows.docs[0].id,
        data: {
          members: [owner.id],
          record: { ...created, memberIds: [String(owner.id)] },
        },
      });
      await expect(
        (await service(member, key)).updateTask(task.id, command),
      ).rejects.toMatchObject({ status: 404 });
      expect((await (await service()).events(task.id)).items).toHaveLength(2);
    });

    const gitTask = async () => {
      const scope = await create();
      const task = await (
        await service()
      ).updateTask(scope.task.id, {
        ...editable(scope.task),
        expectedRevision: scope.task.revision,
        gitBindings: [
          {
            repositoryId: "fixture/platform",
            commitSha: "a".repeat(40),
            purpose: "platform-core",
            source: "manual",
            verification: "unverified",
          },
        ],
      });
      return { ...scope, task };
    };
    const gitFact = (): TaskGitObservationProviderResult => ({
      status: "observed",
      repository: {
        id: "123",
        fullName: "fixture/platform",
        url: "https://github.com/fixture/platform",
      },
      commit: {
        sha: "a".repeat(40),
        url: "https://github.com/fixture/platform/commit/" + "a".repeat(40),
      },
      pullRequests: [],
      pullRequestsComplete: true,
      ci: {
        checkRuns: {
          status: "observed",
          items: [
            {
              id: "7",
              name: "contract tests",
              headSha: "a".repeat(40),
              status: "completed",
              conclusion: "success",
              url: "https://github.com/fixture/platform/runs/7",
            },
          ],
          totalCount: 1,
          complete: true,
        },
        commitStatuses: {
          status: "observed",
          items: [],
          totalCount: 0,
          complete: true,
          combinedState: "pending",
        },
      },
    });

    it("stores exact CI snapshots once across concurrent retries, restart and later task revision", async () => {
      const { task } = await gitTask();
      const observer = vi.fn(async () => gitFact());
      const key = randomUUID();
      const command = { expectedRevision: task.revision };
      const syncService = async () =>
        createTaskManagerService(await request(owner, key), {
          ...taskManagerOptions,
          observeGitBinding: observer,
        });
      const [first, second] = await Promise.all([
        (await syncService()).syncGit(task.id, command),
        (await syncService()).syncGit(task.id, command),
      ]);
      expect(second).toEqual(first);
      expect((await (await service()).gitSyncs(task.id)).items).toEqual([
        first,
      ]);
      expect(first.items[0]).toMatchObject({
        status: "observed",
        ci: {
          checkRuns: { items: [{ headSha: task.gitBindings[0].commitSha }] },
        },
      });
      expect(await (await service()).task(task.id)).toEqual(task);
      expect((await (await service()).events(task.id)).items).toHaveLength(2);
      const callsBeforeRestart = observer.mock.calls.length;
      await payload.destroy();
      payload = await openMcpPayload();
      await (
        await service()
      ).updateTask(task.id, {
        ...editable(task),
        title: "Следующий результат",
        expectedRevision: task.revision,
      });
      expect(await (await syncService()).syncGit(task.id, command)).toEqual(
        first,
      );
      expect(observer).toHaveBeenCalledTimes(callsBeforeRestart);
      await expect(
        (await syncService()).syncGit(task.id, {
          expectedRevision: task.revision + 1,
        }),
      ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
      expect(observer).toHaveBeenCalledTimes(callsBeforeRestart);
      await expect(
        db.query(
          "UPDATE realize_task_git_syncs SET actor_id='forged' WHERE sync_id=$1",
          [first.id],
        ),
      ).rejects.toThrow("TASK_HISTORY_IMMUTABLE");
      await expect(
        db.query("DELETE FROM realize_task_git_syncs WHERE sync_id=$1", [
          first.id,
        ]),
      ).rejects.toThrow("TASK_HISTORY_IMMUTABLE");
      await expect(migrate(gitMigration.down)).rejects.toThrow(
        "TASK_GIT_ROLLBACK_BLOCKED",
      );
    });

    it("rolls back observation and receipt together, then recovers with the same command", async () => {
      const { task } = await gitTask();
      const observer = vi.fn(async () => gitFact());
      const key = randomUUID();
      const command = { expectedRevision: task.revision };
      const syncService = async () =>
        createTaskManagerService(await request(owner, key), {
          ...taskManagerOptions,
          observeGitBinding: observer,
        });
      const before = await db.query(
        "SELECT count(*)::int AS count FROM realize_task_operations WHERE project_id=$1",
        [task.projectId],
      );
      await db.query(`CREATE FUNCTION realize_task_test_fail_git_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.project_id = '${task.projectId}' THEN RAISE EXCEPTION 'TASK_TEST_GIT_RECEIPT_FAILURE'; END IF;
        RETURN NEW; END $$;
        CREATE TRIGGER realize_task_test_git_receipt_failure BEFORE INSERT ON realize_task_operations FOR EACH ROW EXECUTE FUNCTION realize_task_test_fail_git_receipt();`);
      try {
        await expect(
          (await syncService()).syncGit(task.id, command),
        ).rejects.toThrow();
        expect((await (await service()).gitSyncs(task.id)).items).toEqual([]);
        expect(
          (
            await db.query(
              "SELECT count(*)::int AS count FROM realize_task_operations WHERE project_id=$1",
              [task.projectId],
            )
          ).rows[0].count,
        ).toBe(before.rows[0].count);
      } finally {
        await db.query(
          "DROP TRIGGER realize_task_test_git_receipt_failure ON realize_task_operations; DROP FUNCTION realize_task_test_fail_git_receipt();",
        );
      }
      const receipt = await (await syncService()).syncGit(task.id, command);
      expect((await (await service()).gitSyncs(task.id)).items).toEqual([
        receipt,
      ]);
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM realize_task_operations WHERE project_id=$1",
            [task.projectId],
          )
        ).rows[0].count,
      ).toBe(before.rows[0].count + 1);
    });

    it("performs provider reads outside locks and rejects a task changed during the read", async () => {
      const { task } = await gitTask();
      const observer = vi.fn(async ({ req }: { req: PayloadRequest }) => {
        expect(await req.transactionID).toBeUndefined();
        await (
          await service(member)
        ).updateTask(task.id, {
          ...editable(task),
          expectedRevision: task.revision,
          title: "Изменено во время Git",
        });
        return gitFact();
      });
      const manager = createTaskManagerService(await request(), {
        ...taskManagerOptions,
        observeGitBinding: observer,
      });
      await expect(
        manager.syncGit(task.id, { expectedRevision: task.revision }),
      ).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
      expect((await (await service()).gitSyncs(task.id)).items).toEqual([]);
    });

    it("keeps failed later polls as separate history and paginates newest snapshots by a scoped cursor", async () => {
      const { task } = await gitTask();
      const first = await createTaskManagerService(await request(), {
        ...taskManagerOptions,
        observeGitBinding: async () => gitFact(),
      }).syncGit(task.id, { expectedRevision: task.revision });
      const failed = await createTaskManagerService(await request(), {
        ...taskManagerOptions,
        observeGitBinding: async () => ({
          status: "unavailable",
          reason: "provider_unavailable",
        }),
      }).syncGit(task.id, { expectedRevision: task.revision });
      expect((await (await service()).gitSyncs(task.id)).items).toEqual([
        failed,
        first,
      ]);
      // Вставляем собственную fixture историю, не изменяя immutable строки или рабочую БД.
      await db.query(
        `INSERT INTO realize_task_git_syncs (sync_id, task_id, project_id, task_revision, actor_id, record)
        SELECT sync_id, $1, $2, $3, $4, jsonb_set($5::jsonb, '{id}', to_jsonb(sync_id)) FROM (SELECT gen_random_uuid()::text AS sync_id FROM generate_series(1, 50)) AS fixture`,
        [
          task.id,
          task.projectId,
          task.revision,
          String(owner.id),
          JSON.stringify(first),
        ],
      );
      const page = await (await service()).gitSyncs(task.id);
      expect(page.items).toHaveLength(50);
      expect(page.nextCursor).toBeTruthy();
      const tail = await (await service()).gitSyncs(task.id, page.nextCursor);
      expect(tail.items).toEqual([failed, first]);
      expect(tail.nextCursor).toBeNull();
      await expect(
        (await service(member)).gitSyncs(task.id, page.nextCursor),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        (await service(stranger)).gitSyncs(task.id),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("protects append-only history in PostgreSQL and refuses rollback over existing tasks", async () => {
      const before = await db.query(
        "SELECT count(*)::int AS count FROM realize_task_events",
      );
      await expect(
        db.query(
          "UPDATE realize_task_events SET actor_id='forged' WHERE id=(SELECT min(id) FROM realize_task_events)",
        ),
      ).rejects.toThrow("TASK_HISTORY_IMMUTABLE");
      await expect(
        db.query(
          "DELETE FROM realize_task_operations WHERE id=(SELECT min(id) FROM realize_task_operations)",
        ),
      ).rejects.toThrow("TASK_HISTORY_IMMUTABLE");
      await expect(migrate(foundation.down)).rejects.toThrow(
        "TASK_ROLLBACK_BLOCKED",
      );
      const after = await db.query(
        "SELECT count(*)::int AS count FROM realize_task_events",
      );
      expect(after.rows[0].count).toBe(before.rows[0].count);
      expect((await (await service()).projects()).items.length).toBeGreaterThan(
        0,
      );
    });

    it("creates from workspace without a header and replays the current task across actors and restart", async () => {
      const scope = await project();
      const input = {
        ...editable(),
        clientTaskId: randomUUID(),
        projectId: scope.project.id,
        listId: scope.listId,
      };
      const req = await request();
      req.headers.delete("idempotency-key");
      const first = await createTaskManagerService(
        req,
        taskManagerOptions,
      ).createTaskFromWorkspace({
        ...input,
        clientTaskId: input.clientTaskId.toUpperCase(),
        title: `  ${input.title}  `,
      });
      expect(first.disposition).toBe("created");
      expect(first.task.createdBy).toBe(String(owner.id));
      const updated = await (
        await service(member)
      ).updateTask(first.task.id, {
        ...editable(first.task),
        title: "Изменено в Task Manager",
        expectedRevision: 1,
      });
      await payload.destroy();
      payload = await openMcpPayload();
      expect(
        await (await service(member)).createTaskFromWorkspace(input),
      ).toEqual({
        task: updated,
        disposition: "existing",
      });
      expect(
        (await (await service()).events(first.task.id)).items,
      ).toHaveLength(2);
      const stored = await db.query(
        "SELECT workspace_source_id, workspace_create_hash FROM realize_tasks WHERE task_id=$1",
        [first.task.id],
      );
      expect(stored.rows).toEqual([
        {
          workspace_source_id: input.clientTaskId,
          workspace_create_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      ]);
    });

    it("serializes the same global source across actors and rejects a competing target", async () => {
      const firstScope = await project();
      const secondScope = await project();
      const input = {
        ...editable(),
        clientTaskId: randomUUID(),
        projectId: firstScope.project.id,
        listId: firstScope.listId,
      };
      const result = await Promise.all(
        [owner, member].map(async (actor) =>
          (await service(actor)).createTaskFromWorkspace(input),
        ),
      );
      expect(result.map((item) => item.disposition).sort()).toEqual([
        "created",
        "existing",
      ]);
      expect(result[0].task.id).toBe(result[1].task.id);
      expect(
        (await (await service()).events(result[0].task.id)).items,
      ).toHaveLength(1);

      const competingId = randomUUID();
      const competing = await Promise.allSettled([
        (async () =>
          (await service(owner)).createTaskFromWorkspace({
            ...input,
            clientTaskId: competingId,
          }))(),
        (async () =>
          (await service(member)).createTaskFromWorkspace({
            ...input,
            clientTaskId: competingId,
            projectId: secondScope.project.id,
            listId: secondScope.listId,
          }))(),
      ]);
      expect(
        competing.filter((item) => item.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        competing.filter((item) => item.status === "rejected"),
      ).toMatchObject([
        { reason: { code: "WORKSPACE_SOURCE_CONFLICT", status: 409 } },
      ]);
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM realize_tasks WHERE workspace_source_id=$1",
            [competingId],
          )
        ).rows[0].count,
      ).toBe(1);
    });

    it("checks intake ACL before source lookup and rejects changed commands, missing lists and forged actor fields", async () => {
      const scope = await project();
      const input = {
        ...editable(),
        clientTaskId: randomUUID(),
        projectId: scope.project.id,
        listId: scope.listId,
      };
      await (await service()).createTaskFromWorkspace(input);
      for (const [actor, status] of [
        [null, 401],
        [customer, 403],
        [stranger, 404],
      ] as const)
        await expect(
          (await service(actor)).createTaskFromWorkspace(input),
        ).rejects.toMatchObject({ status });
      for (const change of [{ title: "Changed" }, { listId: randomUUID() }])
        await expect(
          (await service()).createTaskFromWorkspace({ ...input, ...change }),
        ).rejects.toMatchObject({
          status: 409,
          code: "WORKSPACE_SOURCE_CONFLICT",
        });
      await expect(
        (await service()).createTaskFromWorkspace({
          ...input,
          createdBy: String(stranger.id),
        }),
      ).rejects.toMatchObject({ status: 422 });
      const missingId = randomUUID();
      await expect(
        (await service()).createTaskFromWorkspace({
          ...input,
          clientTaskId: missingId,
          listId: randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        (await service()).createTaskFromWorkspace({
          ...input,
          clientTaskId: missingId,
          assigneeId: String(stranger.id),
        }),
      ).rejects.toMatchObject({ status: 422 });
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM realize_tasks WHERE workspace_source_id=$1",
            [missingId],
          )
        ).rows[0].count,
      ).toBe(0);
      const row = await payload.find({
        collection: TASK_PROJECTS_SLUG,
        overrideAccess: true,
        where: { projectId: { equals: scope.project.id } },
        limit: 1,
      });
      await payload.update({
        collection: TASK_PROJECTS_SLUG,
        id: row.docs[0].id,
        overrideAccess: true,
        data: {
          members: [owner.id],
          record: { ...scope.project, memberIds: [String(owner.id)] },
        },
      });
      await expect(
        (await service(member)).createTaskFromWorkspace(input),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("rolls back source/task/event together and leaves an inherited transaction intact", async () => {
      const scope = await project();
      const input = {
        ...editable(),
        clientTaskId: randomUUID(),
        projectId: scope.project.id,
        listId: scope.listId,
      };
      await db.query(`CREATE FUNCTION realize_task_workspace_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.project_id = '${scope.project.id}' THEN RAISE EXCEPTION 'TASK_WORKSPACE_TEST_EVENT_FAILURE'; END IF;
        RETURN NEW; END $$;
        CREATE TRIGGER realize_task_workspace_test_failure BEFORE INSERT ON realize_task_events FOR EACH ROW EXECUTE FUNCTION realize_task_workspace_test_failure();`);
      try {
        await expect(
          (await service()).createTaskFromWorkspace(input),
        ).rejects.toThrow();
        expect(
          (
            await db.query(
              "SELECT count(*)::int AS count FROM realize_tasks WHERE workspace_source_id=$1",
              [input.clientTaskId],
            )
          ).rows[0].count,
        ).toBe(0);
      } finally {
        await db.query(
          "DROP TRIGGER realize_task_workspace_test_failure ON realize_task_events; DROP FUNCTION realize_task_workspace_test_failure();",
        );
      }
      const req = await request();
      expect(await initTransaction(req)).toBe(true);
      const outer = req.transactionID;
      try {
        await expect(
          createTaskManagerService(
            req,
            taskManagerOptions,
          ).createTaskFromWorkspace(input),
        ).rejects.toMatchObject({ status: 503 });
        expect(req.transactionID).toBe(outer);
      } finally {
        await killTransaction(req);
      }
      expect(
        (await (await service()).createTaskFromWorkspace(input)).disposition,
      ).toBe("created");
    });

    it("keeps ordinary creates source-free and protects source identity/hash and populated rollback in PostgreSQL", async () => {
      const { task } = await create();
      expect(
        (
          await db.query(
            "SELECT workspace_source_id, workspace_create_hash FROM realize_tasks WHERE task_id=$1",
            [task.id],
          )
        ).rows,
      ).toEqual([{ workspace_source_id: null, workspace_create_hash: null }]);
      const input = {
        ...editable(),
        clientTaskId: randomUUID(),
        projectId: task.projectId,
        listId: task.listId,
      };
      const intake = await (await service()).createTaskFromWorkspace(input);
      for (const statement of [
        "UPDATE realize_tasks SET workspace_source_id=NULL WHERE task_id=$1",
        "UPDATE realize_tasks SET workspace_create_hash=repeat('f',64) WHERE task_id=$1",
        "DELETE FROM realize_tasks WHERE task_id=$1",
      ])
        await expect(db.query(statement, [intake.task.id])).rejects.toThrow(
          "TASK_WORKSPACE_SOURCE_IMMUTABLE",
        );
      await expect(migrate(workspaceMigration.down)).rejects.toThrow(
        "TASK_WORKSPACE_ROLLBACK_BLOCKED",
      );
      expect(await (await service()).createTaskFromWorkspace(input)).toEqual({
        task: intake.task,
        disposition: "existing",
      });
    });
  },
);
