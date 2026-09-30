/**
 * @file tests/int/design-workshop.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Доказывает atomic apply, CAS, durable replay и ACL на настоящей изолированной PostgreSQL.
 * @see documentation/specifications/design-workshop.md
 */
// @vitest-environment node
import { randomBytes, randomUUID } from "node:crypto";
import { Client as PgClient } from "pg";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { createLocalReq, type Payload, type PayloadRequest } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DesignMutationReceiptDto } from "@realize/ai-contracts";
import { DESIGN_WORKSHOP_LIMITS } from "@realize/ai-contracts";
import { openMcpPayload } from "../../services/internal-mcp/src/openMcpPayload.adapter";
import { DesignWorkshop } from "../../packages/payload-ai-plugin/src/design-workshop/DesignWorkshop.service";
import { createDesignWorkshopEndpoints } from "../../packages/payload-ai-plugin/src/design-workshop/designWorkshopEndpoints.controller";
import { sanitizeOptions } from "../../packages/payload-ai-plugin/src/options";
import { down, up } from "../../src/migrations/20260925_133735_design_workshop";
import { designProjectFixture } from "./designWorkshop.fixture";

describe.skipIf(!process.env.WORKSHOP_TEST_DATABASE_URI)(
  "Design Workshop on isolated PostgreSQL",
  () => {
    let payload: Payload;
    let pg: PgClient;
    let owner: NonNullable<PayloadRequest["user"]>;
    let other: NonNullable<PayloadRequest["user"]>;
    let permitted = true;
    const options = sanitizeOptions({
      access: {
        canManageDesignWorkshop: () => permitted,
        canApproveRelease: () => false,
        canManageAIConfiguration: () => false,
        canManageData: () => false,
        canManageIntegrations: () => false,
        canUseChat: () => false,
        canViewRuns: () => false,
      },
      enabled: false,
      runtime: {
        mode: "local-development",
        isolated: true,
        controlPlaneTokenEnv: "WORKSHOP_UNUSED_TOKEN",
      },
    });
    const request = async (
      key: string = randomUUID(),
      actor: PayloadRequest["user"] = owner,
    ) => {
      const req = await createLocalReq({ user: actor ?? undefined }, payload);
      req.headers.set("idempotency-key", key);
      return req;
    };
    const workshop = async (key?: string, actor?: PayloadRequest["user"]) =>
      new DesignWorkshop(await request(key, actor), options);
    const create = async () =>
      (await workshop()).create(designProjectFixture());
    const prepare = async (
      project: DesignMutationReceiptDto,
      text = "main { padding: 24px; }",
    ) =>
      (await workshop()).prepare(project.projectId, {
        baseRevisionId: project.revision.revisionId,
        summary: "Уточнить композицию",
        operations: [
          { kind: "put", path: "src/task.css", content: text },
          {
            kind: "put",
            path: "src/Empty.tsx",
            content: "export const Empty = () => <p>Нет задач</p>;",
          },
        ],
      });

    beforeAll(async () => {
      const url = new URL(process.env.WORKSHOP_TEST_DATABASE_URI!);
      if (
        url.hostname !== "127.0.0.1" ||
        !/^realize_workshop_fixture_[a-z0-9]+$/.test(url.pathname.slice(1)) ||
        process.env.DATABASE_URI !== url.href
      )
        throw new Error("ISOLATED_WORKSHOP_DATABASE_REQUIRED");
      pg = new PgClient({ connectionString: url.href });
      await pg.connect();
      payload = await openMcpPayload();
      const user = async () => ({
        ...(await payload.create({
          collection: "users",
          overrideAccess: true,
          data: {
            email: `workshop-${randomUUID()}@example.invalid`,
            password: randomBytes(32).toString("base64url"),
            name: "Workshop fixture",
            roles: ["admin"],
          },
        })),
        collection: "users" as const,
      });
      owner = await user();
      other = await user();
    }, 30000);
    afterAll(async () => {
      await payload?.destroy();
      await pg?.end();
    });

    it("supports generated empty down/up without disturbing existing users", async () => {
      const counts = await pg.query(
        "SELECT (SELECT count(*) FROM realize_design_projects) + (SELECT count(*) FROM realize_design_revisions) + (SELECT count(*) FROM realize_design_changes) + (SELECT count(*) FROM realize_design_operations) AS count",
      );
      expect(
        Number(counts.rows[0].count),
        "Use a freshly migrated disposable database",
      ).toBe(0);
      const req = await createLocalReq({}, payload);
      const transactionId = await payload.db.beginTransaction();
      if (transactionId == null) throw new Error("TRANSACTION_REQUIRED");
      req.transactionID = transactionId;
      const adapter = payload.db as unknown as PostgresAdapter;
      const db = adapter.sessions[String(transactionId)].db;
      try {
        await down({ db, payload, req });
        await up({ db, payload, req });
        await payload.db.commitTransaction(transactionId);
      } catch (error) {
        await payload.db.rollbackTransaction(transactionId);
        throw error;
      }
      expect(
        (await payload.findByID({ collection: "users", id: owner.id })).id,
      ).toBe(owner.id);
    });

    it("prepares without mutation, then atomically applies a multifile revision", async () => {
      const project = await create();
      const change = await prepare(project);
      expect(
        (await (await workshop()).project(project.projectId)).currentRevision,
      ).toEqual(project.revision);
      const candidate = await (
        await workshop()
      ).change(project.projectId, change.changeId!);
      expect(candidate.status).toBe("prepared");
      expect(candidate.diff.files).toHaveLength(2);
      const applied = await (
        await workshop()
      ).apply(project.projectId, change.changeId!, {});
      expect(applied.revision.number).toBe(2);
      const latest = await (
        await workshop()
      ).revision(project.projectId, applied.revision.revisionId);
      expect(latest.snapshot).toEqual(candidate.candidate);
      expect(latest.contentHash).toBe(candidate.candidateHash);
      expect(latest.parentRevisionId).toBe(project.revision.revisionId);
      expect(
        (
          await (
            await workshop()
          ).revision(project.projectId, project.revision.revisionId)
        ).snapshot.files,
      ).toHaveLength(2);
      expect(
        (await (await workshop()).revisions(project.projectId, {})).items.map(
          (item) => item.number,
        ),
      ).toEqual([2, 1]);
      const detail = await (await workshop()).project(project.projectId);
      expect(detail.workspace.mode).toBe("stored_draft");
      expect(detail).not.toHaveProperty("owner");
      expect(detail).not.toHaveProperty("id");
    });

    it("replays simultaneous duplicate creation once and rejects key reuse for a different command", async () => {
      const key = randomUUID();
      const input = designProjectFixture();
      const first = await Promise.all([
        (await workshop(key)).create(input),
        (await workshop(key)).create(input),
      ]);
      expect(first[0]).toEqual(first[1]);
      const rows = await payload.count({
        collection: "realize-design-projects",
        where: { projectId: { equals: first[0].projectId } },
      });
      expect(rows.totalDocs).toBe(1);
      await expect(
        (await workshop(key)).create({ ...input, title: "Другой проект" }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it("blocks generated rollback when a design project has saved data", async () => {
      const req = await createLocalReq({}, payload);
      const transactionId = await payload.db.beginTransaction();
      if (transactionId == null) throw new Error("TRANSACTION_REQUIRED");
      req.transactionID = transactionId;
      const db = (payload.db as unknown as PostgresAdapter).sessions[
        String(transactionId)
      ].db;
      try {
        let failure: unknown;
        try {
          await down({ db, payload, req });
        } catch (error) {
          failure = error;
        }
        const cause = failure as
          { cause?: { message?: string }; message?: string } | undefined;
        expect(cause?.cause?.message ?? cause?.message).toContain(
          "WORKSHOP_ROLLBACK_BLOCKED",
        );
      } finally {
        await payload.db.rollbackTransaction(transactionId);
      }
      expect((await (await workshop()).list({})).items.length).toBeGreaterThan(
        0,
      );
    });

    it("replays simultaneous apply of the same operation as one revision", async () => {
      const project = await create();
      const change = await prepare(project);
      const key = randomUUID();
      const results = await Promise.all([
        (await workshop(key)).apply(project.projectId, change.changeId!, {}),
        (await workshop(key)).apply(project.projectId, change.changeId!, {}),
      ]);
      expect(results[0]).toEqual(results[1]);
      expect(
        (await (await workshop()).revisions(project.projectId, {})).items,
      ).toHaveLength(2);
    });

    it("allows exactly one of two prepared changes from the same base to advance", async () => {
      const project = await create();
      const first = await prepare(project, "a { color: red; }");
      const second = await prepare(project, "a { color: blue; }");
      const results = await Promise.allSettled([
        (await workshop()).apply(project.projectId, first.changeId!, {}),
        (await workshop()).apply(project.projectId, second.changeId!, {}),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === "rejected"),
      ).toMatchObject({ reason: { status: 409 } });
      expect(
        (await (await workshop()).revisions(project.projectId, {})).items,
      ).toHaveLength(2);
      await expect(
        prepare(project, "a { color: green; }"),
      ).rejects.toMatchObject({ status: 409 });
    });

    it("keeps original receipts across a new Payload instance and later revisions", async () => {
      const key = randomUUID();
      const project = await (
        await workshop(key)
      ).create(designProjectFixture());
      const change = await prepare(project);
      const applyKey = randomUUID();
      const applied = await (
        await workshop(applyKey)
      ).apply(project.projectId, change.changeId!, {});
      const next = await prepare(applied, "a { color: green; }");
      const latest = await (
        await workshop()
      ).apply(project.projectId, next.changeId!, {});
      await payload.destroy();
      payload = await openMcpPayload();
      expect(
        await (await workshop(key)).create(designProjectFixture()),
      ).toEqual(project);
      expect(
        await (
          await workshop(applyKey)
        ).apply(project.projectId, change.changeId!, {}),
      ).toEqual(applied);
      expect(
        (await (await workshop()).project(project.projectId)).currentRevision,
      ).toEqual(latest.revision);
      await expect(
        (await workshop()).apply(project.projectId, change.changeId!, {}),
      ).rejects.toMatchObject({ status: 409 });
    });

    it("rolls back revision, head and change marker if receipt persistence fails", async () => {
      const project = await create();
      const change = await prepare(project);
      const key = randomUUID();
      await pg.query(`CREATE FUNCTION workshop_fixture_reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.receipt->>'action' = 'apply' THEN RAISE EXCEPTION 'WORKSHOP_FIXTURE_RECEIPT_FAILURE'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER workshop_fixture_receipt_failure BEFORE INSERT ON realize_design_operations FOR EACH ROW EXECUTE FUNCTION workshop_fixture_reject_receipt();`);
      try {
        await expect(
          (await workshop(key)).apply(project.projectId, change.changeId!, {}),
        ).rejects.toThrow();
        expect(
          (await (await workshop()).project(project.projectId)).currentRevision,
        ).toEqual(project.revision);
        expect(
          (await (await workshop()).revisions(project.projectId, {})).items,
        ).toHaveLength(1);
        expect(
          (await (await workshop()).change(project.projectId, change.changeId!))
            .appliedRevisionId,
        ).toBeNull();
      } finally {
        await pg.query(
          "DROP TRIGGER workshop_fixture_receipt_failure ON realize_design_operations; DROP FUNCTION workshop_fixture_reject_receipt();",
        );
      }
      expect(
        (
          await (
            await workshop(key)
          ).apply(project.projectId, change.changeId!, {})
        ).revision.number,
      ).toBe(2);
    });

    it("isolates owners on reads, history, prepared writes and receipt replay", async () => {
      const project = await create();
      const change = await prepare(project);
      const foreign = await workshop(undefined, other);
      for (const action of [
        () => foreign.project(project.projectId),
        () => foreign.revisions(project.projectId, {}),
        () => foreign.revision(project.projectId, project.revision.revisionId),
        () => foreign.change(project.projectId, change.changeId!),
        () => foreign.apply(project.projectId, change.changeId!, {}),
        () =>
          foreign.prepare(project.projectId, {
            baseRevisionId: project.revision.revisionId,
            summary: "Не своё",
            operations: [],
          }),
      ])
        await expect(action()).rejects.toMatchObject({ status: 404 });
      expect((await foreign.list({})).items).toEqual([]);
    });

    it("requires explicit current permission even for a successful replay", async () => {
      const key = randomUUID();
      await (await workshop(key)).create(designProjectFixture());
      permitted = false;
      try {
        await expect(
          (await workshop(key)).create(designProjectFixture()),
        ).rejects.toMatchObject({ status: 403 });
      } finally {
        permitted = true;
      }
      const noPermission = sanitizeOptions({
        ...options,
        access: { ...options.access, canManageDesignWorkshop: undefined },
      });
      await expect(
        new DesignWorkshop(await request(), noPermission).list({}),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        (await workshop(undefined, null)).list({}),
      ).rejects.toMatchObject({ status: 401 });
    });

    it("rejects expired prepared changes and detects corrupted candidates", async () => {
      const project = await create();
      const expired = await prepare(project);
      await payload.update({
        collection: "realize-design-changes",
        where: { changeId: { equals: expired.changeId } },
        data: { expiresAt: new Date(0).toISOString() },
      });
      await expect(
        (await workshop()).apply(project.projectId, expired.changeId!, {}),
      ).rejects.toMatchObject({ status: 409 });
      const corrupted = await prepare(project);
      await payload.update({
        collection: "realize-design-changes",
        where: { changeId: { equals: corrupted.changeId } },
        data: { candidateHash: "0".repeat(64) },
      });
      await expect(
        (await workshop()).apply(project.projectId, corrupted.changeId!, {}),
      ).rejects.toThrow("integrity");
      expect(
        (await (await workshop()).project(project.projectId)).currentRevision,
      ).toEqual(project.revision);
    });

    it("keeps generic Payload CRUD closed for authenticated Admin", async () => {
      const req = await request();
      for (const collection of [
        "realize-design-projects",
        "realize-design-revisions",
        "realize-design-changes",
        "realize-design-operations",
      ] as const) {
        await expect(
          payload.find({
            collection,
            overrideAccess: false,
            req,
          }),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
          payload.create({
            collection,
            data: {} as never,
            overrideAccess: false,
            req,
          }),
        ).rejects.toMatchObject({ status: 403 });
        const record = (await payload.find({ collection, limit: 1 })).docs[0];
        await expect(
          payload.update({
            collection,
            id: record.id,
            data: {} as never,
            overrideAccess: false,
            req,
          }),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
          payload.delete({
            collection,
            id: record.id,
            overrideAccess: false,
            req,
          }),
        ).rejects.toMatchObject({ status: 403 });
      }
    });

    it("serves a bounded authenticated endpoint independently of Codex and validates idempotency", async () => {
      const endpoint = createDesignWorkshopEndpoints(options).find(
        (entry) => entry.path.endsWith("/projects") && entry.method === "post",
      )!;
      const invoke = async (
        body: unknown,
        key: string = randomUUID(),
        actor: PayloadRequest["user"] = owner,
      ) => {
        const req = await createLocalReq(
          {
            user: actor ?? undefined,
            req: new Request(
              "http://localhost/api/realize-ai/workshop/projects",
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "idempotency-key": key,
                },
                body: JSON.stringify(body),
              },
            ) as PayloadRequest,
          },
          payload,
        );
        return endpoint.handler(req);
      };
      const response = await invoke(designProjectFixture());
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({
        ok: true,
        data: { action: "create" },
      });
      expect((await invoke(designProjectFixture(), "bad")).status).toBe(400);
      expect(
        (await invoke({ ...designProjectFixture(), actorId: owner.id })).status,
      ).toBe(400);
      expect(
        (await invoke(designProjectFixture(), randomUUID(), null)).status,
      ).toBe(401);
    });

    it("enforces owner quota without allocating another project or receipt", async () => {
      for (let i = 0; i < DESIGN_WORKSHOP_LIMITS.projectsPerOwner; i++)
        await (await workshop(undefined, other)).create(designProjectFixture());
      await expect(
        (await workshop(undefined, other)).create(designProjectFixture()),
      ).rejects.toMatchObject({ status: 409 });
      const list = await (await workshop(undefined, other)).list({});
      expect(list.items).toHaveLength(DESIGN_WORKSHOP_LIMITS.projectsPerOwner);
      expect(list.hasNextPage).toBe(false);
      const receipts = await payload.count({
        collection: "realize-design-operations",
        where: { actor: { equals: other.id } },
      });
      expect(receipts.totalDocs).toBe(DESIGN_WORKSHOP_LIMITS.projectsPerOwner);
    });
  },
);
