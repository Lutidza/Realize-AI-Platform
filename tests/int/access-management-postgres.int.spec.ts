/**
 * @file tests/int/access-management-postgres.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Проверяет реальные транзакции, scopes, browser admission и сохранность access schema в отдельной PostgreSQL fixture.
 * @see documentation/architecture/platform-access.md
 */
// @vitest-environment node
import { randomBytes, randomUUID } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import { Client } from "pg";
import type { MigrateUpArgs } from "@payloadcms/db-postgres";
import {
  createLocalReq,
  initTransaction,
  commitTransaction,
  killTransaction,
  type Payload,
  type PayloadRequest,
} from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTaskManagerService } from "@realize/payload-task-manager/server";
import { migrations } from "../../src/migrations";
import { openMcpPayload } from "../../services/internal-mcp/src/openMcpPayload.adapter";
import { taskManagerOptions } from "../../src/plugins/taskManager.config";
import { accessManagementOptions } from "../../src/plugins/accessManagement.config";
import { resolveAccessManagementOptions } from "../../packages/payload-access-management/src/accessManagementOptions.config";
import { AccessManagementService } from "../../packages/payload-access-management/src/server/AccessManagement.service";
import { AccessCredentialService } from "../../packages/payload-access-management/src/server/AccessCredential.service";
import { AccessDeviceService } from "../../packages/payload-access-management/src/server/AccessDevice.service";
import { authenticateAccessRequest } from "../../packages/payload-access-management/src/server/authenticateAccessRequest.service";
import type {
  AccessScope,
  DeviceStartResult,
} from "@realize/payload-access-management/contracts";

describe.skipIf(!process.env.ACCESS_TEST_DATABASE_URI)(
  "access management on isolated PostgreSQL",
  () => {
    let db: Client;
    let payload: Payload;
    let cookie: string;
    let otherCookie: string;
    let ownerId: string;
    let otherId: string;
    const options = resolveAccessManagementOptions({
      ...accessManagementOptions,
      publicURL: "http://localhost:3000",
    });
    const read: AccessScope[] = ["task-manager:read"];
    const all: AccessScope[] = [
      "task-manager:read",
      "task-manager:write",
      "task-manager:projects",
    ];
    const accessMigration = migrations.find((migration) =>
      /_platform_access$/.test(migration.name),
    )!;
    const migrate = async (operation: typeof accessMigration.up) => {
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
    const request = async (browserCookie?: string, bearer?: string) => {
      const req = await createLocalReq({}, payload);
      req.headers = new Headers({
        origin: options.publicURL,
        "content-type": "application/json",
      });
      if (browserCookie) req.headers.set("cookie", browserCookie);
      if (bearer) req.headers.set("authorization", `Bearer ${bearer}`);
      return req;
    };
    const management = async (browserCookie = cookie) =>
      new AccessManagementService(await request(browserCookie), options);
    const device = async (browserCookie?: string) =>
      new AccessDeviceService(await request(browserCookie), options);
    const credentials = async () =>
      new AccessCredentialService(await request(), options);
    const create = async (scopes = read, browserCookie = cookie) =>
      (await management(browserCookie)).create({
        name: `Fixture ${randomUUID()}`,
        kind: "api",
        scopes,
        expiresInDays: 1,
      });
    const authorize = async (
      token: string,
      scope: AccessScope = "task-manager:read",
    ) =>
      authenticateAccessRequest(
        await request(undefined, token),
        options,
        scope,
      );
    const start = async () =>
      (await device()).start({
        clientName: `CLI ${randomUUID()}`,
        scopes: all,
      });
    const approve = async (grant: DeviceStartResult) =>
      (await device(cookie)).decide({
        userCode: grant.userCode,
        decision: "approve",
      });
    const issueCLI = async () => {
      const grant = await start();
      await approve(grant);
      const result = await (await device()).poll(grant.deviceCode);
      if (!result.credential) throw new Error("FIXTURE_CREDENTIAL_REQUIRED");
      return { grant, bundle: result.credential };
    };

    beforeAll(async () => {
      const uri = new URL(process.env.ACCESS_TEST_DATABASE_URI!);
      if (
        uri.hostname !== "127.0.0.1" ||
        !/^\/realize_task_fixture_[a-f0-9]+$/.test(uri.pathname) ||
        process.env.DATABASE_URI !== uri.href ||
        process.env.PAYLOAD_DB_PUSH !== "false" ||
        process.env.REALIZE_AI_RUNTIME_ISOLATED !== "true"
      )
        throw new Error("ISOLATED_ACCESS_DATABASE_REQUIRED");
      expect(Boolean(accessMigration)).toBe(true);
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
      await migrate(accessMigration.down);
      expect(
        (
          await db.query(
            "SELECT to_regclass('public.access_credentials') AS name",
          )
        ).rows[0].name,
      ).toBeNull();
      await migrate(accessMigration.up);
      payload = await openMcpPayload();
      const user = async () => {
        const email = `access-${randomUUID()}@example.invalid`;
        const password = randomBytes(32).toString("base64url");
        const record = await payload.create({
          collection: "users",
          overrideAccess: true,
          data: { email, password, roles: ["admin"], name: "Access fixture" },
        });
        const login = await payload.login({
          collection: "users",
          data: { email, password },
        });
        if (!login.token) throw new Error("FIXTURE_LOGIN_REQUIRED");
        return {
          id: String(record.id),
          cookie: `${payload.config.cookiePrefix}-token=${login.token}`,
        };
      };
      const owner = await user();
      const other = await user();
      cookie = owner.cookie;
      ownerId = owner.id;
      otherCookie = other.cookie;
      otherId = other.id;
    }, 120000);
    afterAll(async () => {
      await payload?.destroy();
      await db?.end();
    });

    it("stores only hashes, keeps CRUD closed even to Local API and never turns a PAT into generic Users auth", async () => {
      const issued = await create();
      const rows = (
        await db.query(
          "SELECT * FROM access_credentials WHERE credential_id=$1",
          [issued.token.id],
        )
      ).rows;
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows).includes(issued.secret)).toBe(false);
      expect(rows[0].record.accessHash).toMatch(/^[a-f0-9]{64}$/);
      await expect(
        payload.find({
          collection: "access-credentials",
          overrideAccess: true,
        }),
      ).rejects.toThrow("ACCESS_STORAGE_PRIVATE");
      const auth = await payload.auth({
        headers: new Headers({
          authorization: `Bearer ${issued.secret}`,
          DisableAutologin: "true",
        }),
      });
      expect(Boolean(auth.user)).toBe(false);
      const listed = await (await management()).list();
      expect(JSON.stringify(listed).includes(issued.secret)).toBe(false);
      expect(
        Object.keys(listed.items.find((item) => item.id === issued.token.id)!),
      ).not.toContain("accessHash");
    });

    it("requires real browser cookie, same origin and self issuance, restricts another owner", async () => {
      const issued = await create();
      const bearer = new AccessManagementService(
        await request(cookie, issued.secret),
        options,
      );
      await expect(bearer.context()).rejects.toMatchObject({ status: 401 });
      const crossSite = await request(cookie);
      crossSite.headers.set("origin", "https://attacker.invalid");
      await expect(
        new AccessManagementService(crossSite, options).revoke(issued.token.id),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        (await management(otherCookie)).list(ownerId),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        (await management(otherCookie)).revoke(issued.token.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        (await management()).create({
          name: "Bad",
          kind: "api",
          scopes: read,
          expiresInDays: 1,
          ownerId: otherId,
        }),
      ).rejects.toMatchObject({ status: 422 });
      const ownerOptions = { ...options, canManageOthers: () => true };
      const ownerService = new AccessManagementService(
        await request(otherCookie),
        ownerOptions,
      );
      expect(
        (await ownerService.list(ownerId)).items.some(
          (item) => item.id === issued.token.id,
        ),
      ).toBe(true);
      expect((await ownerService.revoke(issued.token.id)).status).toBe(
        "revoked",
      );
    });

    it("enforces scopes inside Task Manager and preserves project membership ACL", async () => {
      const readonly = await create();
      expect((await authorize(readonly.secret))?.actor.id).toBe(ownerId);
      await expect(
        authorize(readonly.secret, "task-manager:write"),
      ).rejects.toMatchObject({ status: 403 });
      const req = await request(undefined, readonly.secret);
      req.headers.set("idempotency-key", randomUUID());
      await expect(
        createTaskManagerService(req, taskManagerOptions).createProject({
          title: "Forbidden",
          description: "",
          memberIds: [],
        }),
      ).rejects.toMatchObject({ status: 403 });
      const full = await create(all);
      const writable = await request(undefined, full.secret);
      writable.headers.set("idempotency-key", randomUUID());
      const project = await createTaskManagerService(
        writable,
        taskManagerOptions,
      ).createProject({
        title: "Access project",
        description: "",
        memberIds: [],
      });
      const stranger = await create(all, otherCookie);
      const outsider = await request(undefined, stranger.secret);
      await expect(
        createTaskManagerService(outsider, taskManagerOptions).lists(
          project.id,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("sees current role removal immediately", async () => {
      const issued = await create(read, otherCookie);
      await payload.update({
        collection: "users",
        id: Number(otherId),
        overrideAccess: true,
        data: { roles: ["customer"] },
      });
      try {
        await expect(authorize(issued.secret)).rejects.toMatchObject({
          status: 403,
        });
      } finally {
        await payload.update({
          collection: "users",
          id: Number(otherId),
          overrideAccess: true,
          data: { roles: ["admin"] },
        });
      }
    });

    it("atomically consumes a device approval once under concurrent poll requests", async () => {
      const grant = await start();
      const decisions = await Promise.all([approve(grant), approve(grant)]);
      expect(decisions.map((item) => item.status)).toEqual([
        "approved",
        "approved",
      ]);
      const results = await Promise.all([
        (await device()).poll(grant.deviceCode),
        (await device()).poll(grant.deviceCode),
      ]);
      expect(results.map((item) => item.status).sort()).toEqual([
        "consumed",
        "issued",
      ]);
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM access_credentials WHERE record->>'name'=$1",
            [decisions[0].clientName],
          )
        ).rows[0].count,
      ).toBe(1);
      const issued = results.find((item) => item.credential)?.credential;
      expect(Boolean(issued)).toBe(true);
      expect((await authorize(issued!.accessToken))?.token?.kind).toBe("cli");
    });

    it("does not issue for denied or expired grants and persists slow-down", async () => {
      const grant = await start();
      expect((await (await device()).poll(grant.deviceCode)).status).toBe(
        "authorization_pending",
      );
      expect((await (await device()).poll(grant.deviceCode)).status).toBe(
        "slow_down",
      );
      await (
        await device(cookie)
      ).decide({ userCode: grant.userCode, decision: "deny" });
      expect((await (await device()).poll(grant.deviceCode)).status).toBe(
        "access_denied",
      );
      const expired = await start();
      await db.query(
        "UPDATE access_device_requests SET record=jsonb_set(record, '{expiresAt}', to_jsonb($1::text)), expires_at=$1::timestamptz WHERE user_code=$2",
        [new Date(Date.now() - 1000).toISOString(), expired.userCode],
      );
      expect((await (await device()).poll(expired.deviceCode)).status).toBe(
        "expired_token",
      );
    });

    it("cancels an already-issued grant and invalidates both credentials", async () => {
      const { grant, bundle } = await issueCLI();
      await (await device()).cancel(grant.deviceCode);
      await expect(authorize(bundle.accessToken)).rejects.toMatchObject({
        status: 401,
      });
      await expect(
        (await credentials()).refresh(bundle.refreshToken),
      ).rejects.toMatchObject({ status: 401 });
    });

    it("rotates atomically, rejects old access and revokes on reuse of any consumed refresh", async () => {
      const { bundle } = await issueCLI();
      const next = await (await credentials()).refresh(bundle.refreshToken);
      await expect(authorize(bundle.accessToken)).rejects.toMatchObject({
        status: 401,
      });
      const latest = await (await credentials()).refresh(next.refreshToken);
      expect((await authorize(latest.accessToken))?.actor.id).toBe(ownerId);
      await expect(
        (await credentials()).refresh(bundle.refreshToken),
      ).rejects.toMatchObject({ status: 401 });
      await expect(authorize(latest.accessToken)).rejects.toMatchObject({
        status: 401,
      });
    });

    it("fails closed under duplicate refresh and supports logout using consumed refresh", async () => {
      const { bundle } = await issueCLI();
      const results = await Promise.allSettled([
        (await credentials()).refresh(bundle.refreshToken),
        (await credentials()).refresh(bundle.refreshToken),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      const success = results.find((result) => result.status === "fulfilled");
      if (success?.status !== "fulfilled")
        throw new Error("FIXTURE_REFRESH_REQUIRED");
      await expect(authorize(success.value.accessToken)).rejects.toMatchObject({
        status: 401,
      });
      expect(
        (await (await credentials()).logout(bundle.refreshToken)).revoked,
      ).toBe(true);
    });

    it("serializes revoke against a token recheck in an active mutation transaction", async () => {
      const issued = await create(all);
      const req: PayloadRequest = await request(undefined, issued.secret);
      await initTransaction(req);
      try {
        await authenticateAccessRequest(req, options, "task-manager:write");
        let finished = false;
        const revoke = (await management())
          .revoke(issued.token.id)
          .then((value) => {
            finished = true;
            return value;
          });
        await new Promise((resolve) => setTimeout(resolve, 80));
        expect(finished).toBe(false);
        await commitTransaction(req);
        expect((await revoke).status).toBe("revoked");
        await expect(authorize(issued.secret)).rejects.toMatchObject({
          status: 401,
        });
      } finally {
        await killTransaction(req);
      }
    });

    it("blocks destructive rollback after credential issuance without losing rows", async () => {
      const before = Number(
        (await db.query("SELECT count(*) AS count FROM access_credentials"))
          .rows[0].count,
      );
      expect(before).toBeGreaterThan(0);
      await expect(migrate(accessMigration.down)).rejects.toThrow(
        "ACCESS_ROLLBACK_BLOCKED",
      );
      expect(
        Number(
          (await db.query("SELECT count(*) AS count FROM access_credentials"))
            .rows[0].count,
        ),
      ).toBe(before);
    });
  },
);
