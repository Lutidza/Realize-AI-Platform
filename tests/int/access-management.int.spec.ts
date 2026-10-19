/**
 * @file tests/int/access-management.int.spec.ts
 * @version 1.0.1
 * @date 2026-10-19
 * @description Проверяет cookie/CSRF, secret-once DTO, ограниченные scopes и безопасные HTTP ошибки доступов.
 * @see documentation/architecture/platform-access.md
 */
// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { PayloadRequest } from "payload";
import { describe, expect, it } from "vitest";
import { accessFixture } from "./access-management.fixture";
import { createAccessCollections } from "../../packages/payload-access-management/src/accessCollections.config";
import { AccessManagementService } from "../../packages/payload-access-management/src/server/AccessManagement.service";
import { authenticateAccessRequest } from "../../packages/payload-access-management/src/server/authenticateAccessRequest.service";
import { createAccessEndpoints } from "../../packages/payload-access-management/src/server/accessEndpoints.controller";
import {
  accessCreateSchema,
  accessTokenSchema,
  credentialBundleSchema,
} from "../../packages/payload-access-management/src/contracts/access.schemas";
import { resolveAccessManagementOptions } from "../../packages/payload-access-management/src/accessManagementOptions.config";
import { ACCESS_CREDENTIALS_SLUG } from "../../packages/payload-access-management/src/accessManagement.constants";
import { readAccessBody } from "../../packages/payload-access-management/src/server/readAccessBody.adapter";
import {
  createAccessCursor,
  readAccessCursor,
} from "../../packages/payload-access-management/src/server/accessCursor.adapter";

const input = {
  name: "Terminal",
  kind: "api" as const,
  scopes: ["task-manager:read" as const],
  expiresInDays: 30,
};
describe("access management security boundaries", () => {
  it("enforces the scope registry, mandatory read and bounded personal expiry", () => {
    expect(accessCreateSchema.parse(input)).toEqual(input);
    for (const change of [
      { scopes: ["*"] },
      { scopes: ["task-manager:write"] },
      { scopes: ["task-manager:read", "task-manager:read"] },
      { expiresInDays: 0 },
      { expiresInDays: 366 },
      { ownerId: "2" },
      { kind: "cli" },
    ])
      expect(
        accessCreateSchema.safeParse({ ...input, ...change }).success,
      ).toBe(false);
  });
  it("requires a fixed secure host origin and rejects redirects, credentials and paths", () => {
    const credentialUrl = new URL("https://realize.example");
    credentialUrl.username = "user";
    credentialUrl.password = "secret";
    const { options } = accessFixture();
    for (const publicURL of [
      "http://other.example",
      credentialUrl.toString(),
      "https://realize.example/path",
      "https://realize.example?next=other",
      "https://realize.example#fragment",
    ])
      expect(() =>
        resolveAccessManagementOptions({ ...options, publicURL }),
      ).toThrow();
    expect(
      resolveAccessManagementOptions({
        ...options,
        publicURL: "http://localhost:3000",
      }).publicURL,
    ).toBe("http://localhost:3000");
  });
  it("blocks direct collection CRUD and Local API override without private context", async () => {
    for (const collection of createAccessCollections()) {
      expect(collection.graphQL).toBe(false);
      expect(
        await collection.access?.read?.({ req: {} as PayloadRequest }),
      ).toBe(false);
      const hook = collection.hooks!.beforeOperation![0];
      expect(() =>
        hook({ context: {}, overrideAccess: true } as Parameters<
          typeof hook
        >[0]),
      ).toThrow("ACCESS_STORAGE_PRIVATE");
    }
  });
  it("never returns a stored secret or hash after the creation response", async () => {
    const fixture = accessFixture();
    const service = new AccessManagementService(
      fixture.request(),
      fixture.options,
    );
    const created = await service.create(input);
    expect(created.secret).toMatch(/^rza\.[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/);
    expect(accessTokenSchema.parse(created.token)).toEqual(created.token);
    const stored = JSON.stringify([...fixture.rows]);
    expect(stored).not.toContain(created.secret);
    const listed = await service.list();
    expect(listed.items).toEqual([created.token]);
    expect(JSON.stringify(listed)).not.toMatch(/accessHash|refreshHash|secret/);
    expect(credentialBundleSchema.safeParse({ ...listed }).success).toBe(false);
  });
  it("requires cookie verification, denies Authorization and mismatched mutation Origin", async () => {
    const fixture = accessFixture();
    for (const headers of [
      { authorization: "Bearer existing-token" },
      { origin: "https://attacker.example" },
      { cookie: "payload-token=fake" },
      { cookie: "" },
    ] as Record<string, string>[]) {
      const service = new AccessManagementService(
        fixture.request("/api/access/tokens", { headers }),
        fixture.options,
      );
      await expect(service.create(input)).rejects.toMatchObject({
        status: headers.origin ? 403 : 401,
      });
    }
    expect(fixture.payload.create).not.toHaveBeenCalled();
    const req = fixture.request();
    req.headers.delete("origin");
    await expect(
      new AccessManagementService(req, fixture.options).create(input),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      fixture.payload.auth.mock.calls.every(
        ([{ headers }]) => headers.get("DisableAutologin") === "true",
      ),
    ).toBe(true);
  });
  it("allows own tokens and owner revoke, never lets ordinary admin inspect another owner", async () => {
    const fixture = accessFixture();
    const owner = new AccessManagementService(
      fixture.request(),
      fixture.options,
    );
    const other = new AccessManagementService(
      fixture.request("/api/access", {}, 2),
      fixture.options,
    );
    const created = await owner.create(input);
    await expect(other.list("1")).rejects.toMatchObject({ status: 403 });
    await expect(other.revoke(created.token.id)).rejects.toMatchObject({
      status: 404,
    });
    const second = await other.create(input);
    expect(second.token.ownerId).toBe("2");
    expect((await owner.list("2")).items[0].id).toBe(second.token.id);
    const revoked = await owner.revoke(second.token.id);
    expect(revoked.status).toBe("revoked");
    expect(await owner.revoke(second.token.id)).toEqual(revoked);
  });
  it("authenticates a narrow bearer endpoint-locally and records use without granting write", async () => {
    const fixture = accessFixture();
    const issued = await new AccessManagementService(
      fixture.request(),
      fixture.options,
    ).create(input);
    const req = fixture.request(
      "/api/task-manager/projects",
      { headers: { authorization: `bearer ${issued.secret}` } },
      null,
    );
    const session = await authenticateAccessRequest(
      req,
      fixture.options,
      "task-manager:read",
    );
    expect(req.user?.id).toBe(1);
    expect(session?.token?.lastUsedAt).not.toBeNull();
    await expect(
      authenticateAccessRequest(req, fixture.options, "task-manager:write"),
    ).rejects.toMatchObject({ status: 403 });
    expect(req.user).toBeNull();
    expect(fixture.execute.mock.calls.flat().join(" ")).toContain(
      "pg_advisory_xact_lock",
    );
  });
  it("never falls back to an existing cookie for malformed or revoked prefixed credentials", async () => {
    const fixture = accessFixture();
    const service = new AccessManagementService(
      fixture.request(),
      fixture.options,
    );
    const issued = await service.create(input);
    await service.revoke(issued.token.id);
    for (const value of [
      issued.secret,
      "rza.invalid",
      `rzr.${randomUUID()}.${"a".repeat(43)}`,
      `rzd.${randomUUID()}.${"a".repeat(43)}`,
    ]) {
      const req = fixture.request("/api/task-manager/projects", {
        headers: { authorization: `Bearer ${value}` },
      });
      await expect(
        authenticateAccessRequest(req, fixture.options, "task-manager:read"),
      ).rejects.toMatchObject({ status: 401 });
      expect(req.user).toBeNull();
    }
    for (const authorization of [
      issued.secret,
      `Basic ${issued.secret}`,
      `JWT ${issued.secret}`,
      "Bearer rza",
    ]) {
      const req = fixture.request("/api/task-manager/projects", {
        headers: { authorization },
      });
      await expect(
        authenticateAccessRequest(req, fixture.options, "task-manager:read"),
      ).rejects.toMatchObject({ status: 401 });
      expect(req.user).toBeNull();
    }
    const legacy = fixture.request("/api/task-manager/projects", {
      headers: { authorization: "Bearer legacy-jwt" },
    });
    expect(
      await authenticateAccessRequest(
        legacy,
        fixture.options,
        "task-manager:read",
      ),
    ).toBeNull();
    expect(legacy.user?.id).toBe(1);
  });
  it("rechecks current user rights and expiry on every bearer request", async () => {
    const fixture = accessFixture();
    const issued = await new AccessManagementService(
      fixture.request(),
      fixture.options,
    ).create(input);
    const req = fixture.request("/api/task-manager/projects", {
      headers: { authorization: `Bearer ${issued.secret}` },
    });
    fixture.rows.get("users")![0].roles = [];
    await expect(
      authenticateAccessRequest(req, fixture.options, "task-manager:read"),
    ).rejects.toMatchObject({ status: 403 });
    fixture.rows.get("users")![0].roles = ["admin"];
    const record = fixture.rows.get(ACCESS_CREDENTIALS_SLUG)![0]
      .record as Record<string, unknown>;
    record.accessExpiresAt = "2020-01-01T00:00:00.000Z";
    await expect(
      authenticateAccessRequest(req, fixture.options, "task-manager:read"),
    ).rejects.toMatchObject({ status: 401 });
    fixture.rows.set("users", []);
    record.accessExpiresAt = "2099-01-01T00:00:00.000Z";
    await expect(
      authenticateAccessRequest(req, fixture.options, "task-manager:read"),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("bounds body streams, rejects duplicate query parameters and masks storage exceptions", async () => {
    const fixture = accessFixture();
    await expect(
      readAccessBody(
        fixture.request("/api/access", {
          method: "POST",
          body: JSON.stringify({ value: "x".repeat(9000) }),
        }),
      ),
    ).rejects.toMatchObject({ status: 422 });
    const endpoint = createAccessEndpoints(fixture.options).find(
      (item) => item.path === "/access/tokens" && item.method === "get",
    )!;
    const invalid = await endpoint.handler(
      fixture.request("/api/access/tokens?ownerId=1&ownerId=2"),
    );
    expect(invalid.status).toBe(422);
    fixture.payload.find.mockRejectedValueOnce(
      new Error("secret-database-password"),
    );
    const failed = await endpoint.handler(fixture.request());
    expect(failed.status).toBe(503);
    expect(failed.headers.get("cache-control")).toContain("no-store");
    expect(await failed.text()).not.toContain("secret-database-password");
  });
  it("binds cursors to actor and owner and rejects modified cursors", () => {
    const cursor = createAccessCursor("fixture-key", "actor:1:owner:2", 10);
    expect(readAccessCursor("fixture-key", "actor:1:owner:2", cursor)).toBe(10);
    for (const [scope, value] of [
      ["actor:2:owner:2", cursor],
      ["actor:1:owner:1", cursor],
      ["actor:1:owner:2", `${cursor}x`],
    ])
      expect(() => readAccessCursor("fixture-key", scope, value)).toThrow();
  });
});
