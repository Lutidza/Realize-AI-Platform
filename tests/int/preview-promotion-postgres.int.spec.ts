// @vitest-environment node
/**
 * @file tests/int/preview-promotion-postgres.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Проверяет concurrency и rollback preview queue на изолированной PostgreSQL схеме с узким Local API fixture.
 */
import { randomUUID } from "node:crypto";
import {
  drizzle,
  type NodePgDatabase,
} from "@payloadcms/db-postgres/drizzle/node-postgres";
import { Pool, type PoolClient } from "pg";
import type { PayloadRequest } from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { queuePreviewPromotion } from "../../packages/payload-ai-plugin/src/endpoints/queuePreviewPromotion.service";
import { DeploymentRepository } from "../../packages/payload-ai-plugin/src/endpoints/deploymentRepository";
import { previewPromotionFixture } from "./fixtures/previewPromotion";

// Явная отдельная настройка: обычный test:int не использует рабочую БД автоматически.
const connectionString = process.env.REALIZE_PREVIEW_RETRY_TEST_DATABASE_URL;
describe.skipIf(!connectionString)(
  "preview retry PostgreSQL transaction",
  () => {
    const schema = `preview_retry_test_${randomUUID().replaceAll("-", "")}`;
    const pool = new Pool({
      connectionString,
      options: `-c search_path=${schema}`,
      max: 6,
    });
    const fixture = previewPromotionFixture();
    const sessions: Record<
      string,
      { db: Pick<NodePgDatabase, "execute">; client: PoolClient }
    > = {};
    let rejectCreate = false;

    beforeAll(async () => {
      await pool.query(`CREATE SCHEMA ${schema}`);
      await pool.query(`CREATE TABLE realize_ai_change_requests (
      id integer PRIMARY KEY, state text NOT NULL, version integer NOT NULL,
      blocked_reason text, updated_at timestamptz DEFAULT now()
    )`);
      await pool.query(`CREATE TABLE realize_ai_deployments (
      id serial PRIMARY KEY, data jsonb NOT NULL,
      idempotency_key text UNIQUE NOT NULL, created_at timestamptz DEFAULT now()
    )`);
    });
    beforeEach(async () => {
      rejectCreate = false;
      await pool.query(
        "TRUNCATE realize_ai_deployments, realize_ai_change_requests RESTART IDENTITY",
      );
      await pool.query(
        "INSERT INTO realize_ai_change_requests (id,state,version,blocked_reason) VALUES (18,'preview_failed',15,'Chromium unavailable')",
      );
      await pool.query(
        "INSERT INTO realize_ai_deployments (data,idempotency_key) VALUES ($1,$2)",
        [fixture.deployment, "previous-request"],
      );
    });
    afterAll(async () => {
      for (const [id, session] of Object.entries(sessions)) {
        await session.client.query("ROLLBACK");
        session.client.release();
        delete sessions[id];
      }
      await pool.query(`DROP SCHEMA ${schema} CASCADE`);
      await pool.end();
    });

    const clientFor = async (req: PayloadRequest) => {
      const id = await req.transactionID;
      return id ? sessions[String(id)]!.client : pool;
    };
    const request = () => {
      const payload = {
        db: {
          name: "postgres",
          defaultIDType: "number",
          sessions,
          beginTransaction: async () => {
            const client = await pool.connect();
            await client.query("BEGIN");
            const id = randomUUID();
            sessions[id] = { client, db: drizzle(client) };
            return id;
          },
          commitTransaction: async (id: string) => {
            const session = sessions[id]!;
            await session.client.query("COMMIT");
            session.client.release();
            delete sessions[id];
          },
          rollbackTransaction: async (id: string) => {
            const session = sessions[id]!;
            await session.client.query("ROLLBACK");
            session.client.release();
            delete sessions[id];
          },
        },
        find: async (args: {
          collection: string;
          req: PayloadRequest;
          where: Record<string, unknown>;
        }) => {
          const client = await clientFor(args.req);
          let docs: Record<string, unknown>[] = [];
          if (args.collection === "realize-ai-change-requests") {
            const result = await client.query(
              "SELECT state,version,blocked_reason FROM realize_ai_change_requests WHERE id=18",
            );
            docs = result.rows.map((row) => ({
              ...fixture.change,
              state: row.state,
              version: row.version,
              blockedReason: row.blocked_reason,
            }));
          } else if (args.collection === "realize-ai-conversations") {
            const where = JSON.stringify(args.where);
            docs = where.includes('"createdBy":{"equals":7}')
              ? [{ id: 2, createdBy: 7 }]
              : [];
          } else if (args.collection === "realize-ai-execution-jobs") {
            docs = [fixture.job];
          } else if (args.collection === "realize-ai-approvals") {
            docs = JSON.stringify(args.where).includes(
              "IMPLEMENTATION_ACCEPTANCE",
            )
              ? [fixture.acceptance]
              : [];
          } else if (args.collection === "realize-ai-deployments") {
            const conditions = args.where.and as
              Array<{ idempotencyKey?: { equals: string } }> | undefined;
            const key = conditions?.find(
              (condition) => condition.idempotencyKey,
            )?.idempotencyKey?.equals;
            const result = key
              ? await client.query(
                  "SELECT id,data FROM realize_ai_deployments WHERE idempotency_key=$1",
                  [key],
                )
              : await client.query(
                  "SELECT id,data FROM realize_ai_deployments ORDER BY created_at DESC,id DESC LIMIT 1",
                );
            docs = result.rows.map((row) => ({ ...row.data, id: row.id }));
          } else throw new Error(`Unexpected collection ${args.collection}`);
          return { docs, totalDocs: docs.length };
        },
        create: async (args: {
          collection: string;
          req: PayloadRequest;
          data: Record<string, unknown>;
        }) => {
          if (rejectCreate) throw new Error("Synthetic create failure");
          expect(args.collection).toBe("realize-ai-deployments");
          expect(args.req.transactionID).toBeTruthy();
          const client = await clientFor(args.req);
          const result = await client.query(
            "INSERT INTO realize_ai_deployments(data,idempotency_key) VALUES ($1,$2) RETURNING id",
            [args.data, args.data.idempotencyKey],
          );
          return { ...args.data, id: result.rows[0].id };
        },
      };
      return { payload } as unknown as PayloadRequest;
    };
    const queue = (
      key: string,
      overrides: Partial<Parameters<typeof queuePreviewPromotion>[0]> = {},
    ) =>
      queuePreviewPromotion({
        changeRequestID: "18",
        idempotencyKey: key,
        request: {
          expectedVersion: 15,
          expectedDiffHash: String(fixture.job.diffHash),
        },
        req: request(),
        ttlSeconds: 3600,
        userID: 7,
        ...overrides,
      });
    const state = async () => {
      const changes = await pool.query(
        "SELECT state,version,blocked_reason FROM realize_ai_change_requests WHERE id=18",
      );
      const deployments = await pool.query(
        "SELECT data FROM realize_ai_deployments ORDER BY id",
      );
      return {
        change: changes.rows[0],
        deployments: deployments.rows.map((row) => row.data),
      };
    };

    it("два разных ключа создают одну попытку и увеличивают версию один раз", async () => {
      const results = await Promise.allSettled([
        queue("retry-one"),
        queue("retry-two"),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = results.find(
        (result) => result.status === "rejected",
      ) as PromiseRejectedResult;
      expect(rejected.reason.code).toBe("CONFLICT");
      const current = await state();
      expect(current.change).toMatchObject({
        state: "preview_queued",
        version: 16,
        blocked_reason: null,
      });
      expect(current.deployments).toHaveLength(2);
      expect(current.deployments[0]).toEqual(fixture.deployment);
      expect(current.deployments[1]).toMatchObject({
        status: "queued",
        sourceDiffHash: fixture.job.diffHash,
        executionJob: 16,
      });
      expect(current.deployments[1].deploymentKey).not.toBe(
        fixture.deployment.deploymentKey,
      );
    });

    it("одновременный replay одного ключа возвращает ту же попытку", async () => {
      expect(
        (await Promise.all([queue("same-key"), queue("same-key")])).sort(),
      ).toEqual([false, true]);
      expect((await state()).deployments).toHaveLength(2);
    });

    it("ошибка создания откатывает state/version и сохраняет failed evidence", async () => {
      rejectCreate = true;
      await expect(queue("failed-create")).rejects.toThrow(
        "Synthetic create failure",
      );
      const current = await state();
      expect(current.change).toMatchObject({
        state: "preview_failed",
        version: 15,
        blocked_reason: "Chromium unavailable",
      });
      expect(current.deployments).toEqual([fixture.deployment]);
    });

    it("SQL CAS отклоняет неверную версию даже при существующей row lock", async () => {
      const req = request();
      const id = await req.payload.db.beginTransaction();
      if (id == null)
        throw new Error("PostgreSQL transaction was not started.");
      req.transactionID = id;
      const repository = new DeploymentRepository(req.payload, req);
      try {
        await repository.lockChangeRequest("18");
        await expect(
          repository.queueChangeRequest({
            changeRequestID: "18",
            expectedState: "preview_failed",
            expectedVersion: 14,
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" });
      } finally {
        await req.payload.db.rollbackTransaction(id);
        delete req.transactionID;
      }
      expect((await state()).change.version).toBe(15);
    });

    it("проверяет владельца и hash перед любым изменением", async () => {
      await expect(queue("foreign-user", { userID: 8 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(
        queue("changed-hash", {
          request: { expectedVersion: 15, expectedDiffHash: "changed" },
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await state()).deployments).toHaveLength(1);
    });

    it("idempotency key не позволяет заменить artifact исходной попытки", async () => {
      await expect(
        queue("previous-request", {
          request: { expectedVersion: 15, expectedDiffHash: "changed" },
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await state()).change.version).toBe(15);
    });
  },
);
