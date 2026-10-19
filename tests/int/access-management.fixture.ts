/**
 * @file tests/int/access-management.fixture.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Изолирует проверки access domain через in-memory Payload port с rollback и явной auth fixture.
 * @see documentation/architecture/platform-access.md
 */
import { randomUUID } from "node:crypto";
import type { PayloadRequest } from "payload";
import { vi } from "vitest";
import { resolveAccessManagementOptions } from "../../packages/payload-access-management/src/accessManagementOptions.config";

function matches(
  row: Record<string, unknown>,
  where: Record<string, unknown>,
): boolean {
  return Object.entries(where).every(([field, value]) => {
    if (field === "and")
      return (value as Record<string, unknown>[]).every((item) =>
        matches(row, item),
      );
    if (field === "or")
      return (value as Record<string, unknown>[]).some((item) =>
        matches(row, item),
      );
    const clauses = value as Record<string, unknown>;
    return Object.entries(clauses).every(([operator, expected]) => {
      const actual = row[field];
      switch (operator) {
        case "equals":
          return String(actual) === String(expected);
        case "in":
          return (expected as unknown[]).map(String).includes(String(actual));
        case "contains":
          return (actual as unknown[]).map(String).includes(String(expected));
        case "greater_than":
          return actual! > expected!;
        case "less_than":
          return actual! < expected!;
        default:
          throw new Error(`Unsupported test operator: ${operator}`);
      }
    });
  });
}

/** Не доказывает PostgreSQL concurrency: эти границы проверяются отдельной disposable suite. */
export function accessFixture() {
  const rows = new Map<string, Array<Record<string, unknown>>>();
  rows.set("users", [
    { id: 1, name: "Первый", roles: ["admin"] },
    { id: 2, name: "Второй", roles: ["admin"] },
  ]);
  let serial = 10;
  let snapshot = structuredClone(rows);
  const execute = vi.fn(async () => undefined);
  const db = {
    name: "postgres",
    defaultIDType: "number",
    sessions: {} as Record<string, { db: { execute: typeof execute } }>,
    beginTransaction: vi.fn(async () => {
      const id = randomUUID();
      snapshot = structuredClone(rows);
      db.sessions[id] = { db: { execute } };
      return id;
    }),
    commitTransaction: vi.fn(async () => undefined),
    rollbackTransaction: vi.fn(async () => {
      rows.clear();
      for (const [key, value] of snapshot) rows.set(key, value);
    }),
  };
  const find = vi.fn(
    async ({
      collection,
      where = {},
      limit = 1000,
      sort = "id",
    }: {
      collection: string;
      where?: Record<string, unknown>;
      limit?: number;
      sort?: string;
    }) => {
      const found = (rows.get(collection) ?? [])
        .filter((row) => matches(row, where))
        .sort(
          (a, b) =>
            (Number(a.id) - Number(b.id)) * (sort.startsWith("-") ? -1 : 1),
        );
      return { docs: structuredClone(found.slice(0, limit)) };
    },
  );
  const create = vi.fn(
    async ({
      collection,
      data,
    }: {
      collection: string;
      data: Record<string, unknown>;
    }) => {
      const row = structuredClone({ ...data, id: ++serial });
      rows.set(collection, [...(rows.get(collection) ?? []), row]);
      return structuredClone(row);
    },
  );
  const update = vi.fn(
    async ({
      collection,
      id,
      data,
    }: {
      collection: string;
      id: string | number;
      data: Record<string, unknown>;
    }) => {
      const row = rows.get(collection)?.find((row) => row.id === id);
      if (!row) throw new Error("Missing fixture row");
      Object.assign(row, structuredClone(data));
      return structuredClone(row);
    },
  );
  const payload = {
    db,
    find,
    create,
    update,
    secret: "test-only-access-cursor-key",
    collections: { users: {} },
    config: { cookiePrefix: "payload" },
    count: vi.fn(
      async ({
        collection,
        where,
      }: {
        collection: string;
        where: Record<string, unknown>;
      }) => ({
        totalDocs: (rows.get(collection) ?? []).filter((row) =>
          matches(row, where),
        ).length,
      }),
    ),
    delete: vi.fn(
      async ({
        collection,
        where,
      }: {
        collection: string;
        where: Record<string, unknown>;
      }) => {
        rows.set(
          collection,
          (rows.get(collection) ?? []).filter((row) => !matches(row, where)),
        );
      },
    ),
    auth: vi.fn(async ({ headers }: { headers: Headers }) => {
      const match = headers.get("cookie")?.match(/payload-token=browser([12])/);
      return {
        user: match
          ? {
              id: Number(match[1]),
              collection: "users",
              _strategy: "local-jwt",
            }
          : null,
      };
    }),
  };
  const options = resolveAccessManagementOptions({
    userCollection: "users",
    publicURL: "https://realize.example",
    canUseAccess: ({ req }) =>
      Boolean(
        (req.user as unknown as { roles: string[] } | null)?.roles.includes(
          "admin",
        ),
      ),
    canManageOthers: ({ req }) => String(req.user?.id) === "1",
  });
  const request = (
    path = "/api/access",
    init: RequestInit = {},
    actor: number | null = 1,
  ) =>
    Object.assign(
      new Request(`https://realize.example${path}`, {
        ...init,
        headers: {
          ...(actor === null
            ? {}
            : { cookie: `payload-token=browser${actor}` }),
          origin: "https://realize.example",
          "content-type": "application/json",
          ...Object.fromEntries(new Headers(init.headers)),
        },
      }),
      {
        payload,
        user:
          actor === null
            ? null
            : { id: actor, collection: "users", roles: ["admin"] },
        context: {},
      },
    ) as unknown as PayloadRequest;
  return { rows, request, payload, options, execute };
}
