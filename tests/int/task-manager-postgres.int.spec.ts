/**
 * @file tests/int/task-manager-postgres.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-11
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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTaskManagerService } from "@realize/payload-task-manager/server";
import type {
  TaskDto,
  TaskEditableFields,
  TaskProjectDto,
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
    const foundation = migrations.at(-1)!;

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
      await migrate(foundation.down);
      await migrate(foundation.up);
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
  },
);
